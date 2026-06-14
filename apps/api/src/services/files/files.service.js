// Librairie de fichiers (brief V2 §3.7B).
//
// Flow d'upload (signed URL, le client pousse direct vers Supabase Storage,
// le backend ne proxie pas le binaire) :
//   1. POST /files/upload-url   → { path, signedUrl, token }
//   2. client PUT le fichier sur signedUrl
//   3. POST /files/finalize     → crée la row métadonnées (status uploaded)
//
// Lecture : listFiles + createSignedDownloadUrl. Suppression : remove storage
// + delete row.

const crypto = require('node:crypto')
const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const { UserFacingError, NotFoundError } = require('../../lib/error-handler')

const BUCKET = 'workspace-files'
const MAX_SIZE = 25 * 1024 * 1024 // 25 Mo (aligné sur le bucket)
const ALLOWED_MIME = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
])

function sanitizeFilename(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120)
}

function buildPath(workspaceId, filename) {
  return `${workspaceId}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`
}

function assertMime(mimeType) {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new UserFacingError(`Type de fichier non autorisé : ${mimeType}`, {
      statusCode: 400,
      code: 'UNSUPPORTED_FILE_TYPE',
    })
  }
}

/**
 * Génère une URL d'upload signée. Ne crée PAS encore de row (évite les
 * orphelins si l'upload échoue). Le client appelle finalize après.
 */
async function createUploadUrl(workspaceId, { filename, mimeType }) {
  assertMime(mimeType)
  const path = buildPath(workspaceId, filename)
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) {
    logger.error(
      { event: 'file_upload_url_failed', workspaceId, error: error.message },
      'createSignedUploadUrl failed',
    )
    throw new UserFacingError("Impossible de préparer l'upload.", {
      statusCode: 502,
      code: 'UPLOAD_URL_FAILED',
    })
  }
  return { path, signedUrl: data.signedUrl, token: data.token }
}

/**
 * Enregistre la métadonnée après upload réussi côté client.
 */
async function finalizeUpload(workspaceId, userId, { path, filename, mimeType, sizeBytes }) {
  assertMime(mimeType)
  if (!path || !String(path).startsWith(`${workspaceId}/`)) {
    throw new UserFacingError('Chemin de fichier invalide.', {
      statusCode: 400,
      code: 'INVALID_PATH',
    })
  }
  const size = Number(sizeBytes) || 0
  if (size > MAX_SIZE) {
    throw new UserFacingError('Fichier trop volumineux (max 25 Mo).', {
      statusCode: 400,
      code: 'FILE_TOO_LARGE',
    })
  }
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('files')
    .insert({
      workspace_id: workspaceId,
      uploaded_by: userId || null,
      filename: sanitizeFilename(filename),
      mime_type: mimeType,
      size_bytes: size,
      storage_path: path,
      status: 'uploaded',
    })
    .select('id, filename, mime_type, size_bytes, status, created_at')
    .single()
  if (error) throw error
  return data
}

async function listFiles(workspaceId, { limit = 100 } = {}) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('files')
    .select('id, filename, mime_type, size_bytes, status, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

async function getFile(workspaceId, fileId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', fileId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Fichier introuvable.')
  return data
}

/** URL de téléchargement signée (60 min). */
async function createDownloadUrl(workspaceId, fileId) {
  const file = await getFile(workspaceId, fileId)
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, 3600)
  if (error) {
    throw new UserFacingError('Impossible de générer le lien de téléchargement.', {
      statusCode: 502,
      code: 'DOWNLOAD_URL_FAILED',
    })
  }
  return { filename: file.filename, mimeType: file.mime_type, signedUrl: data.signedUrl }
}

/**
 * Télécharge le contenu d'un fichier et le renvoie en base64 (pour injection
 * multimodale dans le chat). Limité aux types exploitables par le LLM.
 * @returns {Promise<{ filename, mimeType, base64 }>}
 */
async function getFileContent(workspaceId, fileId) {
  const file = await getFile(workspaceId, fileId)
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase.storage.from(BUCKET).download(file.storage_path)
  if (error || !data) {
    throw new UserFacingError('Impossible de lire le fichier.', {
      statusCode: 502,
      code: 'FILE_DOWNLOAD_FAILED',
    })
  }
  // data est un Blob (Node 20). On convertit en Buffer puis base64.
  const buf = Buffer.from(await data.arrayBuffer())
  return { filename: file.filename, mimeType: file.mime_type, base64: buf.toString('base64') }
}

async function deleteFile(workspaceId, fileId) {
  const file = await getFile(workspaceId, fileId)
  const supabase = getServiceRoleClient()
  // Storage d'abord (best-effort), puis la row.
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([file.storage_path])
  if (rmErr) {
    logger.warn(
      { event: 'file_storage_remove_failed', fileId, error: rmErr.message },
      'File storage remove failed (continuing to delete row)',
    )
  }
  const { error } = await supabase
    .from('files')
    .delete()
    .eq('id', fileId)
    .eq('workspace_id', workspaceId)
  if (error) throw error
  return { deleted: true }
}

module.exports = {
  createUploadUrl,
  finalizeUpload,
  listFiles,
  getFile,
  getFileContent,
  createDownloadUrl,
  deleteFile,
  sanitizeFilename,
  ALLOWED_MIME,
  MAX_SIZE,
}
