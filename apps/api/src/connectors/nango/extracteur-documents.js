// ExtracteurDocuments — Flux B : documents non-structurés pour RAG.
//
// Objectif : extraire le texte des pages Notion connectées via Nango,
// le nettoyer (Markdown → texte chunké), puis l'envoyer vers un système
// d'embeddings pour permettre des recherches sémantiques (RAG) depuis le
// chat IA.
//
// État : SQUELETTE. L'implémentation viendra une fois que :
//   1. Le sync pages-notion (nango.yaml) est activé côté Nango
//   2. Le store vectoriel cible est choisi (Supabase pgvector vs Pinecone)
//   3. Le pipeline embedding est défini (modèle, dimensions, taille de chunk)

const { nango } = require('../../services/auth/nango.service')
const { logger } = require('../../lib/logger')

class ExtracteurDocuments {
  /**
   * @param {Object} params
   * @param {string} params.workspaceId
   * @param {string} params.connectionId - Nango connection_id Notion
   */
  constructor({ workspaceId, connectionId }) {
    this.workspaceId = workspaceId
    this.connectionId = connectionId
  }

  // ── Notion ──────────────────────────────────────────────────────────────
  /**
   * Récupère les pages Notion synchronisées par Nango, les chunke et
   * retourne une liste de blocs prêts pour vectorisation.
   *
   * @returns {Promise<Array<{id: string, titre: string, chunks: string[]}>>}
   */
  async extraireNotion() {
    throw new Error('À implémenter : sync pages-notion → chunking → liste de blocs.')
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Découpe un texte long en chunks d'environ `tailleCible` tokens, en
   * respectant les frontières de phrase. Cible : ~500 tokens par chunk pour
   * un modèle d'embedding type text-embedding-3-small ou voyage-2.
   *
   * @param {string} _texte
   * @param {number} _tailleCible - Nombre de tokens cible par chunk
   * @returns {string[]} Liste de chunks
   */
  _decouper(_texte, _tailleCible = 500) {
    throw new Error('À implémenter : chunking par phrase avec overlap configurable.')
  }

  /**
   * Génère les vecteurs d'embedding pour une liste de chunks et les
   * persiste dans le store vectoriel (à définir : Supabase pgvector ou
   * Pinecone).
   *
   * @param {string[]} _chunks
   */
  async _vectoriser(_chunks) {
    throw new Error('À implémenter : embedding + persistance store vectoriel.')
  }
}

module.exports = ExtracteurDocuments
