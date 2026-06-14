// Files routes: /api/v1/files/* (brief V2 §3.7B — librairie de fichiers)

const express = require('express')
const { body, param, query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope, requireRole } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const filesService = require('../services/files/files.service')

const router = express.Router()
router.use(jwtMiddleware)

// ━━━ POST /files/upload-url — prépare un upload (URL signée) ━━━
router.post(
  '/upload-url',
  [
    body('workspaceId').isUUID(),
    body('filename').isString().isLength({ min: 1, max: 200 }),
    body('mimeType').isString().notEmpty(),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const result = await filesService.createUploadUrl(req.workspaceId, {
        filename: req.body.filename,
        mimeType: req.body.mimeType,
      })
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ POST /files/finalize — enregistre la métadonnée après upload ━━━
router.post(
  '/finalize',
  [
    body('workspaceId').isUUID(),
    body('path').isString().notEmpty(),
    body('filename').isString().isLength({ min: 1, max: 200 }),
    body('mimeType').isString().notEmpty(),
    body('sizeBytes').optional().isInt({ min: 0 }),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const file = await filesService.finalizeUpload(req.workspaceId, req.user?.id, {
        path: req.body.path,
        filename: req.body.filename,
        mimeType: req.body.mimeType,
        sizeBytes: req.body.sizeBytes,
      })
      res.status(201).json(file)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ GET /files — liste ━━━
router.get(
  '/',
  [query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const files = await filesService.listFiles(req.workspaceId)
      res.json({ files })
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ GET /files/:id/download — URL de téléchargement signée ━━━
router.get(
  '/:id/download',
  [param('id').isUUID(), query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const result = await filesService.createDownloadUrl(req.workspaceId, req.params.id)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

// ━━━ DELETE /files/:id ━━━
router.delete(
  '/:id',
  [param('id').isUUID(), query('workspaceId').isUUID()],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const result = await filesService.deleteFile(req.workspaceId, req.params.id)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
