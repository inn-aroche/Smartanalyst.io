// Tests team.service (acceptInvitation flow + validators).

const test = require('node:test')
const assert = require('node:assert/strict')

const SUPABASE_PATH = require.resolve('../src/lib/supabase')
const EMAIL_PATH = require.resolve('../src/services/email/resend.service')
const SERVICE_PATH = require.resolve('../src/services/team/team.service')

function load({
  invitation = null,
  memberDeniedReason = null,
  insertMemberError = null,
} = {}) {
  const captured = {
    insertedMember: null,
    updatedInvitation: null,
    insertedInvitation: null,
    sentEmails: [],
  }

  const handlers = {
    workspace_invitations(op) {
      if (op === 'select') {
        return {
          eq: () => ({
            maybeSingle: async () => ({ data: invitation, error: null }),
          }),
        }
      }
      if (op === 'update') {
        return (row) => {
          captured.updatedInvitation = row
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: { id: invitation?.id || 'i1' }, error: null }),
              }),
            }),
          }
        }
      }
      if (op === 'insert') {
        return (row) => {
          captured.insertedInvitation = row
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'inv-new', ...row },
                error: null,
              }),
            }),
          }
        }
      }
    },
    workspace_members(op) {
      if (op === 'insert') {
        return (row) => {
          captured.insertedMember = row
          if (insertMemberError) return { error: insertMemberError }
          return { error: null }
        }
      }
    },
    workspaces(op) {
      if (op === 'select') {
        const wsChain = {
          eq: () => wsChain,
          maybeSingle: async () => ({ data: { name: 'Acme' }, error: null }),
        }
        return wsChain
      }
    },
  }

  const from = (table) => {
    const chain = {
      select() {
        return handlers[table]?.('select') || chain
      },
      insert(row) {
        const h = handlers[table]?.('insert')
        if (typeof h === 'function') return h(row)
        return chain
      },
      update(row) {
        const h = handlers[table]?.('update')
        if (typeof h === 'function') return h(row)
        return chain
      },
      eq() {
        return chain
      },
      maybeSingle: async () => ({ data: null, error: null }),
    }
    return chain
  }

  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: {
      getServiceRoleClient: () => ({
        from,
        auth: {
          admin: {
            getUserById: async (id) => ({
              data: { user: { id, email: `${id}@example.com`, user_metadata: {} } },
              error: null,
            }),
          },
        },
      }),
    },
  }
  require.cache[EMAIL_PATH] = {
    id: EMAIL_PATH,
    filename: EMAIL_PATH,
    loaded: true,
    exports: {
      sendEmail: async (params) => {
        captured.sentEmails.push(params)
        return { ok: true, id: 'mail-1' }
      },
    },
  }
  delete require.cache[SERVICE_PATH]
  return { svc: require(SERVICE_PATH), captured }
}

test('acceptInvitation : sans token → throw TOKEN_REQUIRED', async () => {
  const { svc } = load()
  await assert.rejects(
    () => svc.acceptInvitation('', 'u-1', 'a@b.c'),
    (e) => e.code === 'TOKEN_REQUIRED',
  )
})

test('acceptInvitation : invitation introuvable → throw 404', async () => {
  const { svc } = load({ invitation: null })
  await assert.rejects(
    () => svc.acceptInvitation('some-token', 'u-1', 'a@b.c'),
    (e) => e.statusCode === 404,
  )
})

test('acceptInvitation : email ne matche pas → throw EMAIL_MISMATCH', async () => {
  const { svc } = load({
    invitation: {
      id: 'i1',
      workspace_id: 'ws-1',
      email: 'invited@example.com',
      role: 'editor',
      status: 'pending',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
  })
  await assert.rejects(
    () => svc.acceptInvitation('tok', 'u-1', 'other@example.com'),
    (e) => e.code === 'EMAIL_MISMATCH',
  )
})

test('acceptInvitation : expirée → throw INVITE_EXPIRED', async () => {
  const { svc } = load({
    invitation: {
      id: 'i1',
      workspace_id: 'ws-1',
      email: 'a@b.c',
      role: 'editor',
      status: 'pending',
      expires_at: new Date(Date.now() - 1000).toISOString(),
    },
  })
  await assert.rejects(
    () => svc.acceptInvitation('tok', 'u-1', 'a@b.c'),
    (e) => e.code === 'INVITE_EXPIRED',
  )
})

test('acceptInvitation : OK → cree membership + marque accepted', async () => {
  const { svc, captured } = load({
    invitation: {
      id: 'i1',
      workspace_id: 'ws-1',
      email: 'a@b.c',
      role: 'editor',
      status: 'pending',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
  })
  const r = await svc.acceptInvitation('tok', 'u-1', 'A@B.C')
  assert.equal(r.workspaceId, 'ws-1')
  assert.equal(r.role, 'editor')
  assert.equal(captured.insertedMember.workspace_id, 'ws-1')
  assert.equal(captured.insertedMember.user_id, 'u-1')
  assert.equal(captured.updatedInvitation.status, 'accepted')
})

test('acceptInvitation : deja membre (23505) tolere', async () => {
  const { svc, captured } = load({
    invitation: {
      id: 'i1',
      workspace_id: 'ws-1',
      email: 'a@b.c',
      role: 'editor',
      status: 'pending',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
    insertMemberError: { code: '23505', message: 'duplicate' },
  })
  const r = await svc.acceptInvitation('tok', 'u-1', 'a@b.c')
  assert.equal(r.workspaceId, 'ws-1')
  assert.equal(captured.updatedInvitation.status, 'accepted')
})

test('inviteMember : email invalide → throw INVALID_EMAIL', async () => {
  const { svc } = load()
  await assert.rejects(
    () => svc.inviteMember('ws-1', 'u-1', { email: 'not-an-email', role: 'editor' }),
    (e) => e.code === 'INVALID_EMAIL',
  )
})

test('inviteMember : role invalide → throw INVALID_ROLE', async () => {
  const { svc } = load()
  await assert.rejects(
    () => svc.inviteMember('ws-1', 'u-1', { email: 'a@b.c', role: 'evil' }),
    (e) => e.code === 'INVALID_ROLE',
  )
})

test('inviteMember : OK → insert + envoie email', async () => {
  const { svc, captured } = load()
  const r = await svc.inviteMember('ws-1', 'u-1', { email: 'A@B.C', role: 'viewer' })
  assert.equal(r.email, 'a@b.c') // normalise lowercase
  assert.equal(captured.insertedInvitation.email, 'a@b.c')
  assert.equal(captured.insertedInvitation.role, 'viewer')
  assert.ok(captured.insertedInvitation.token_hash)
  assert.equal(captured.sentEmails.length, 1)
  assert.match(captured.sentEmails[0].subject, /Acme/)
})
