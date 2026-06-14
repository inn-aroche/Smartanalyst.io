// Tests files.service : validation type/taille, path scoping, finalize, delete.

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const SERVICE_PATH = require.resolve('../src/services/files/files.service')

function load({
  insertResult = { data: { id: 'f-1', filename: 'x.csv' }, error: null },
  getResult = { data: { id: 'f-1', storage_path: 'ws-1/abc-x.csv', filename: 'x.csv', mime_type: 'text/csv' }, error: null },
  signedUpload = { data: { signedUrl: 'https://up', token: 'tok', path: 'p' }, error: null },
  signedDownload = { data: { signedUrl: 'https://dl' }, error: null },
} = {}) {
  const calls = { removed: [], deleted: false }

  const tableChain = {
    insert() { return this },
    select() { return this },
    eq() { return this },
    order() { return this },
    limit() { return this },
    single: async () => insertResult,
    maybeSingle: async () => getResult,
    delete() { calls.deleted = true; return this },
    then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve) },
  }
  const storageApi = {
    createSignedUploadUrl: async () => signedUpload,
    createSignedUrl: async () => signedDownload,
    remove: async (paths) => { calls.removed.push(...paths); return { error: null } },
  }
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH, filename: SUPABASE_PATH, loaded: true,
    exports: {
      getServiceRoleClient: () => ({
        from: () => tableChain,
        storage: { from: () => storageApi },
      }),
    },
  }
  delete require.cache[SERVICE_PATH]
  return { svc: require(SERVICE_PATH), calls }
}

test('createUploadUrl : type non autorisé → UNSUPPORTED_FILE_TYPE', async () => {
  const { svc } = load()
  await assert.rejects(
    () => svc.createUploadUrl('ws-1', { filename: 'x.exe', mimeType: 'application/x-msdownload' }),
    (e) => e.code === 'UNSUPPORTED_FILE_TYPE',
  )
})

test('createUploadUrl : type OK → path scopé workspace + signedUrl', async () => {
  const { svc } = load()
  const r = await svc.createUploadUrl('ws-1', { filename: 'ventes T2.csv', mimeType: 'text/csv' })
  assert.ok(r.path.startsWith('ws-1/'))
  assert.match(r.path, /ventes_T2\.csv$/) // sanitized
  assert.equal(r.signedUrl, 'https://up')
})

test('finalizeUpload : path hors workspace → INVALID_PATH', async () => {
  const { svc } = load()
  await assert.rejects(
    () => svc.finalizeUpload('ws-1', 'u-1', { path: 'ws-2/evil.csv', filename: 'x.csv', mimeType: 'text/csv' }),
    (e) => e.code === 'INVALID_PATH',
  )
})

test('finalizeUpload : trop gros → FILE_TOO_LARGE', async () => {
  const { svc } = load()
  await assert.rejects(
    () =>
      svc.finalizeUpload('ws-1', 'u-1', {
        path: 'ws-1/abc.csv',
        filename: 'x.csv',
        mimeType: 'text/csv',
        sizeBytes: 30 * 1024 * 1024,
      }),
    (e) => e.code === 'FILE_TOO_LARGE',
  )
})

test('finalizeUpload : OK → insère la row', async () => {
  const { svc } = load()
  const f = await svc.finalizeUpload('ws-1', 'u-1', {
    path: 'ws-1/abc.csv',
    filename: 'x.csv',
    mimeType: 'text/csv',
    sizeBytes: 1024,
  })
  assert.equal(f.id, 'f-1')
})

test('createDownloadUrl : renvoie une URL signée', async () => {
  const { svc } = load()
  const r = await svc.createDownloadUrl('ws-1', 'f-1')
  assert.equal(r.signedUrl, 'https://dl')
  assert.equal(r.filename, 'x.csv')
})

test('deleteFile : retire du storage puis supprime la row', async () => {
  const { svc, calls } = load()
  const r = await svc.deleteFile('ws-1', 'f-1')
  assert.equal(r.deleted, true)
  assert.deepEqual(calls.removed, ['ws-1/abc-x.csv'])
  assert.equal(calls.deleted, true)
})
