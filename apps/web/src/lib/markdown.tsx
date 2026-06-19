// Mini-renderer markdown — couvre uniquement ce que SmartAnalyst utilise dans
// ses réponses chat : `**gras**`, `*italique*`, bullets `*` ou `-`, et les
// paragraphes (double newline). Aucune dépendance externe.
//
// Pourquoi pas marked / react-markdown : on rend 3-4 patterns sur des
// réponses < 2 ko. La dépendance pèse ~30 ko gzip pour 0 valeur ajoutée.
//
// Sécurité : on N'INTERPRÈTE PAS de HTML brut (pas de balises, pas de href).
// Le texte arrive de Gemini ; n'importe quel '<' est rendu en clair via React.
//
// Le rendu intègre aussi les marqueurs de citation `[N]` qui sont passés au
// callback `renderCitation` pour rendre les boutons cliquables vers les
// sources (préserve le comportement existant).

import { type ReactNode } from 'react'

export function renderMarkdown(
  text: string,
  renderCitation: (id: number, key: string) => ReactNode,
): ReactNode {
  if (!text) return null
  // Découpe en paragraphes (= blocs séparés par 1+ lignes vides).
  // Chaque paragraphe peut être : un titre **gras**, une liste, ou de la prose.
  const blocks = text.split(/\n{2,}/)
  return blocks.map((block, i) => {
    if (isBulletList(block)) {
      return (
        <ul key={i} className="my-2 list-none space-y-1.5 pl-0">
          {block.split('\n').map((line, j) => {
            const cleaned = line.replace(/^\s*[-*]\s+/, '')
            return (
              <li key={j} className="relative pl-4 leading-relaxed">
                <span className="absolute left-0 top-[0.55em] h-1.5 w-1.5 rounded-full bg-brand-blue-deep" />
                {renderInline(cleaned, renderCitation, `b${i}l${j}`)}
              </li>
            )
          })}
        </ul>
      )
    }
    // Paragraphe normal : on respecte les retours à la ligne simples comme
    // des <br> (cas du modèle qui aligne ses bullets sans ligne vide entre).
    const lines = block.split('\n')
    return (
      <p key={i} className="leading-relaxed [&:not(:first-child)]:mt-2">
        {lines.map((line, j) => (
          <span key={j}>
            {renderInline(line, renderCitation, `b${i}l${j}`)}
            {j < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    )
  })
}

function isBulletList(block: string): boolean {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return false
  return lines.every((l) => /^[-*]\s+\S/.test(l))
}

/**
 * Rendu inline : **gras**, *italique*, et les marqueurs [N] de citation.
 * Tokenisé en une seule passe pour garder l'ordre des éléments.
 */
function renderInline(
  text: string,
  renderCitation: (id: number, key: string) => ReactNode,
  keyPrefix: string,
): ReactNode[] {
  // Regex unique qui capture les 3 patterns. Ordre des alternatives : on
  // veut matcher `**...**` avant `*...*`, sinon le double-astérisque se ferait
  // attraper comme deux italiques vides.
  const re = /(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[(\d+)\](?!\w))/g
  const out: ReactNode[] = []
  let last = 0
  let m
  let k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1]) {
      // **gras**
      const inner = m[1].slice(2, -2)
      out.push(
        <strong key={`${keyPrefix}-${k++}`} className="font-semibold text-text-1">
          {inner}
        </strong>,
      )
    } else if (m[2]) {
      // *italique*
      const inner = m[2].slice(1, -1)
      out.push(
        <em key={`${keyPrefix}-${k++}`} className="italic">
          {inner}
        </em>,
      )
    } else if (m[3]) {
      // [N] citation
      const id = Number(m[4])
      out.push(renderCitation(id, `${keyPrefix}-${k++}`))
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
