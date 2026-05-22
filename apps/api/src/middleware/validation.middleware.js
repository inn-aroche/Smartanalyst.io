// Middleware d'aide pour express-validator: lit les résultats de validation,
// raise UserFacingError(400) si erreur, message FR de la première erreur.
//
// Pattern d'usage:
//   router.get('/foo',
//     [body('x').isUUID().withMessage('x doit être un UUID.')],
//     runValidation,
//     workspaceScope,  // ← garanti que x est un UUID avant d'arriver ici
//     handler,
//   )

const { validationResult } = require('express-validator')
const { UserFacingError } = require('../lib/error-handler')

function runValidation(req, res, next) {
  const errors = validationResult(req)
  if (errors.isEmpty()) return next()

  const first = errors.array()[0]
  return next(
    new UserFacingError(first.msg, {
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      meta: { field: first.path, errors: errors.array() },
    }),
  )
}

module.exports = { runValidation }
