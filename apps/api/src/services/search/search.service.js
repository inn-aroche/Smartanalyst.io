// Recherche globale cross-entity (cahier §3 Lot 2).
//
// Stratégie pragmatique : 3 requêtes ILIKE en parallèle (1 par entité),
// limit serré (5 max par bucket), fusion + tri par date de création desc.
// L'index trigramme (migration 033) accélère le ILIKE même sur des grosses
// tables.
//
// Pas de scoring sémantique pour ce 1er round — l'ordre par récence suffit
// pour un produit où les volumes restent humains (centaines, pas millions).

const { getServiceRoleClient } = require('../../lib/supabase')

const PER_BUCKET = 5

function escapeLike(q) {
  // Sécurise les wildcards SQL (% et _) qui pourraient transformer la requête
  // user en match large involontaire.
  return String(q).replace(/[%_]/g, '\\$&')
}

async function search({ workspaceId, query, limit = PER_BUCKET }) {
  if (!workspaceId || !query || query.trim().length < 2) {
    return { conversations: [], insights: [], reports: [] }
  }
  const supabase = getServiceRoleClient()
  const q = `%${escapeLike(query.trim())}%`
  const cap = Math.min(Math.max(limit, 1), 20)

  // Requêtes en parallèle pour minimiser la latence perçue (typing-time-feedback).
  const [conversationsRes, insightsRes, reportsRes] = await Promise.all([
    supabase
      .from('chat_conversations')
      .select('id, title, updated_at')
      .eq('workspace_id', workspaceId)
      .ilike('title', q)
      .order('updated_at', { ascending: false })
      .limit(cap),
    supabase
      .from('insights')
      .select('id, title, summary, severity, status, created_at')
      .eq('workspace_id', workspaceId)
      .or(`title.ilike.${q},summary.ilike.${q}`)
      .order('created_at', { ascending: false })
      .limit(cap),
    supabase
      .from('reports')
      .select('id, title, kind, period_start, period_end, created_at')
      .eq('workspace_id', workspaceId)
      .ilike('title', q)
      .order('created_at', { ascending: false })
      .limit(cap),
  ])

  return {
    conversations: conversationsRes.data || [],
    insights: insightsRes.data || [],
    reports: reportsRes.data || [],
  }
}

module.exports = { search }
