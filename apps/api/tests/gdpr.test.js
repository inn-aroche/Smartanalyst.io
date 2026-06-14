// Tests GDPR : export shape + delete cascade rules + confirmation guard.

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const SERVICE_PATH = require.resolve('../src/services/gdpr/gdpr.service')

function load(fixtures = {}) {
  const calls = []
  const {
    memberships = [],
    ownedOrgs = [],
    connectors = [],
    canonicalMetrics = [],
    insights = [],
    auditLogs = [],
    waitlistSignup = null,
    memberCountByWs = {},
    workspaceCountByOrg = {},
    waitlistDeleteCount = 0,
    auditUpdateCount = 0,
  } = fixtures

  function chain(table) {
    const c = {
      table,
      _filter: {},
      _action: 'select',
      _opts: {},
      select(_cols, opts) { this._opts = opts || {}; this._action = 'select'; return this },
      delete(opts) { this._opts = opts || {}; this._action = 'delete'; return this },
      update(values, opts) { this._opts = opts || {}; this._action = 'update'; this._values = values; return this },
      insert(values) { calls.push({ table, action: 'insert', values }); return Promise.resolve({ data: null, error: null }) },
      eq(col, val) { this._filter[col] = val; return this },
      in(col, vals) { this._filter[`${col}:in`] = vals; return this },
      order() { return this },
      limit() { return this },
      maybeSingle: async () => ({ data: waitlistSignup, error: null }),
      head: true,
      then(resolve) {
        calls.push({ table, action: this._action, filter: { ...this._filter }, opts: { ...this._opts }, values: this._values })
        return Promise.resolve(this._resolveValue()).then(resolve)
      },
      _resolveValue() {
        if (table === 'workspace_members' && this._action === 'select' && this._filter.user_id) {
          return { data: memberships, error: null }
        }
        if (table === 'workspace_members' && this._action === 'select' && this._opts.head) {
          // count membres dans un ws
          const wsId = this._filter.workspace_id
          return { data: null, count: memberCountByWs[wsId] ?? 0, error: null }
        }
        if (table === 'workspaces' && this._action === 'select' && this._opts.head) {
          // count workspaces dans une org
          const orgId = this._filter.organization_id
          return { data: null, count: workspaceCountByOrg[orgId] ?? 0, error: null }
        }
        if (table === 'organizations' && this._action === 'select' && this._filter.owner_id) {
          return { data: ownedOrgs, error: null }
        }
        if (table === 'workspaces' && this._action === 'delete') return { data: null, error: null }
        if (table === 'organizations' && this._action === 'delete') return { data: null, error: null }
        if (table === 'workspace_members' && this._action === 'delete') return { data: null, error: null }
        if (table === 'organizations' && this._action === 'update') return { data: null, error: null }
        if (table === 'waitlist_signups' && this._action === 'delete') {
          return { data: null, count: waitlistDeleteCount, error: null }
        }
        if (table === 'audit_logs' && this._action === 'update') {
          return { data: null, count: auditUpdateCount, error: null }
        }
        if (table === 'connectors') return { data: connectors, error: null }
        if (table === 'canonical_metrics') return { data: canonicalMetrics, error: null }
        if (table === 'insights') return { data: insights, error: null }
        if (table === 'audit_logs') return { data: auditLogs, error: null }
        return { data: [], error: null }
      },
    }
    return c
  }

  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH, filename: SUPABASE_PATH, loaded: true,
    exports: {
      getServiceRoleClient: () => ({ from: (t) => chain(t) }),
      getAnonClient: () => ({}),
      getUserScopedClient: () => ({}),
    },
  }
  // Mock fetch (Supabase admin delete user)
  const originalFetch = global.fetch
  global.fetch = async (url, init) => {
    calls.push({ table: 'auth.delete', action: 'fetch', url, init })
    return { ok: true, status: 200, text: async () => '' }
  }

  delete require.cache[SERVICE_PATH]
  const svc = require(SERVICE_PATH)
  return { svc, calls, restore: () => { global.fetch = originalFetch } }
}

test('exportUserData renvoie une payload structurée avec notes', async () => {
  const { svc, restore } = load({
    memberships: [{ role: 'admin', workspace_id: 'ws-1', workspaces: { id: 'ws-1', name: 'Acme' } }],
    ownedOrgs: [{ id: 'org-1' }],
    connectors: [{ id: 'c-1', source: 'stripe' }],
    canonicalMetrics: [{ workspace_id: 'ws-1', date: '2026-06-13' }],
    insights: [],
    auditLogs: [{ action: 'login', created_at: '2026-06-12T00:00:00Z' }],
    waitlistSignup: { id: 'wl-1', email: 'a@b.com' },
  })
  try {
    const data = await svc.exportUserData('u-1', 'a@b.com')
    assert.equal(data.user.id, 'u-1')
    assert.equal(data.user.email, 'a@b.com')
    assert.equal(data.workspaces.length, 1)
    assert.equal(data.organizations.length, 1)
    assert.equal(data.connectors.length, 1)
    assert.equal(data.canonical_metrics.length, 1)
    assert.equal(data.audit_logs.length, 1)
    assert.ok(data.waitlist_signup)
    assert.ok(data.notes.length >= 1)
    assert.match(data.exported_at, /^\d{4}-\d{2}-\d{2}T/)
  } finally {
    restore()
  }
})

test('requireConfirmation rejette les phrases incorrectes', () => {
  const { svc, restore } = load()
  try {
    assert.throws(() => svc.requireConfirmation(''), (err) => err.code === 'CONFIRMATION_REQUIRED')
    assert.throws(() => svc.requireConfirmation('delete'), (err) => err.code === 'CONFIRMATION_REQUIRED')
    assert.throws(() => svc.requireConfirmation('YES'), (err) => err.code === 'CONFIRMATION_REQUIRED')
    // OK :
    svc.requireConfirmation('DELETE MY ACCOUNT')
  } finally {
    restore()
  }
})

test('deleteUserData : sole-member workspaces deleted, shared workspaces preserved', async () => {
  const { svc, calls, restore } = load({
    memberships: [
      { workspace_id: 'ws-solo' }, // je suis seul
      { workspace_id: 'ws-shared' }, // 3 membres
    ],
    memberCountByWs: { 'ws-solo': 1, 'ws-shared': 3 },
    waitlistDeleteCount: 0,
    auditUpdateCount: 7,
  })
  try {
    const r = await svc.deleteUserData('u-1', 'a@b.com')
    const wsDeletes = calls.filter((c) => c.table === 'workspaces' && c.action === 'delete')
    assert.equal(wsDeletes.length, 1)
    assert.equal(wsDeletes[0].filter.id, 'ws-solo')
    assert.equal(r.deleted.workspaces, 1)
    assert.equal(r.deleted.audit_anonymized, 7)
  } finally {
    restore()
  }
})

test('deleteUserData : org orpheline supprimée, org peuplée → owner null', async () => {
  const { svc, calls, restore } = load({
    memberships: [],
    ownedOrgs: [{ id: 'org-empty' }, { id: 'org-peuplee' }],
    workspaceCountByOrg: { 'org-empty': 0, 'org-peuplee': 4 },
  })
  try {
    const r = await svc.deleteUserData('u-1', 'a@b.com')
    const orgDeletes = calls.filter((c) => c.table === 'organizations' && c.action === 'delete')
    const orgUpdates = calls.filter((c) => c.table === 'organizations' && c.action === 'update')
    assert.equal(orgDeletes.length, 1)
    assert.equal(orgDeletes[0].filter.id, 'org-empty')
    assert.equal(orgUpdates.length, 1)
    assert.equal(orgUpdates[0].filter.id, 'org-peuplee')
    assert.equal(orgUpdates[0].values.owner_id, null)
    assert.equal(r.deleted.organizations, 1)
  } finally {
    restore()
  }
})

test('deleteUserData : audit final inséré (anonymisé)', async () => {
  const { svc, calls, restore } = load({})
  try {
    await svc.deleteUserData('u-1', 'a@b.com')
    const audit = calls.find((c) => c.table === 'audit_logs' && c.action === 'insert')
    assert.ok(audit)
    assert.equal(audit.values.user_id, null)
    assert.equal(audit.values.action, 'gdpr_delete')
    assert.ok(audit.values.changes.email_hash.startsWith('h:'))
  } finally {
    restore()
  }
})
