# 06_SUPABASE_BONNES_PRATIQUES.md

## Vue d'ensemble
Utilisation optimale de Supabase (Auth, RLS, Vault, Storage, Realtime).

## 1. Auth (JWT)

```javascript
// Signup
const { user, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password'
})

// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
})

// Get session
const { data: { session } } = await supabase.auth.getSession()
```

## 2. RLS (Row-Level Security)

Already configured in migration 008.

## 3. Vault (Token encryption)

```javascript
// Encrypt a token
const encrypted = await supabase.rpc('vault_encrypt_secret', {
  secret: 'ya29.a0...',
  key_id: 'ga4-tokens'
})

// Decrypt
const decrypted = await supabase.rpc('vault_decrypt_secret', {
  secret: encrypted
})
```

## 4. Storage (PDFs)

```javascript
// Upload PDF
const { data, error } = await supabase.storage
  .from('reports')
  .upload(`workspace-${workspaceId}/report-${reportId}.pdf`, pdfBlob)

// Generate signed URL
const { data } = await supabase.storage
  .from('reports')
  .createSignedUrl(`workspace-${workspaceId}/report-${reportId}.pdf`, 3600)
```

## 5. Realtime (Events)

```javascript
// Subscribe to updates
supabase
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'workspace_updates' },
    (payload) => console.log(payload)
  )
  .subscribe()
```

---

