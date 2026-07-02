// Mini-renderer markdown — couvre ce que SmartAnalyst utilise dans ses
// réponses chat : `**gras**`, `*italique*`, `code`, bullets `*`/`-`, listes
// numérotées, titres `#`→`####`, tables GFM, blocs ``` et liens http(s).
// Aucune dépendance externe.
//
// Pourquoi pas marked / react-markdown : on rend une dizaine de patterns sur
// des réponses < 4 ko. La dépendance pèse ~30 ko gzip pour 0 valeur ajoutée.
//
// Sécurité : on N'INTERPRÈTE PAS de HTML brut (pas de balises). Les liens ne
// sont rendus que pour des URLs http(s) explicites ; tout le reste passe par
// React en texte clair.
//
// Le rendu intègre aussi les marqueurs de citation `[N]` qui sont passés au
// callback `renderCitation` pour rendre les boutons cliquables vers les
// sources (préserve le comportement existant).

import { Fragment, type ReactNode } from 'react'

export function renderMarkdown(
  text: string,
  renderCitation: (id: number, key: string) => ReactNode,
): ReactNode {
  if (!text) return null
  // 1) Extraire les blocs de code clôturés AVANT le split paragraphe : un
  //    fence peut contenir des lignes vides qui casseraient le découpage.
  const out: ReactNode[] = []
  const fenceRe = /```\w*\n?([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  let seg = 0
  while ((m = fenceRe.exec(text)) !== null) {
    if (m.index > last) {
      out.push(
        <Fragment key={`s${seg}`}>
          {renderBlocks(text.slice(last, m.index), renderCitation, `s${seg}`)}
        </Fragment>,
      )
      seg++
    }
    out.push(
      <pre
        key={`c${seg}`}
        className="my-2 overflow-x-auto rounded-lg border border-border bg-bg-2 p-3 font-mono text-[12.5px] leading-relaxed text-text-1"
      >
        <code>{m[1].replace(/\n$/, '')}</code>
      </pre>,
    )
    seg++
    last = m.index + m[0].length
  }
  if (last < text.length) {
    out.push(
      <Fragment key={`s${seg}`}>
        {renderBlocks(text.slice(last), renderCitation, `s${seg}`)}
      </Fragment>,
    )
  }
  return out
}

function renderBlocks(
  text: string,
  renderCitation: (id: number, key: string) => ReactNode,
  keyPrefix: string,
): ReactNode[] {
  const nodes: ReactNode[] = []
  const blocks = text.split(/\n{2,}/)
  blocks.forEach((block, i) => {
    if (!block.trim()) return
    // Sépare les lignes-titres du reste du bloc (le modèle colle souvent un
    // titre et son paragraphe sans ligne vide entre les deux).
    const lines = block.split('\n')
    let buf: string[] = []
    const flush = () => {
      if (buf.length === 0) return
      nodes.push(
        renderSimpleBlock(buf.join('\n'), renderCitation, `${keyPrefix}b${i}n${nodes.length}`),
      )
      buf = []
    }
    for (const line of lines) {
      const h = line.match(/^(#{1,4})\s+(.+)$/)
      if (h) {
        flush()
        nodes.push(
          renderHeading(h[1].length, h[2], renderCitation, `${keyPrefix}b${i}h${nodes.length}`),
        )
      } else {
        buf.push(line)
      }
    }
    flush()
  })
  return nodes
}

function renderHeading(
  level: number,
  content: string,
  renderCitation: (id: number, key: string) => ReactNode,
  key: string,
): ReactNode {
  const inner = renderInline(content, renderCitation, key)
  if (level <= 2) {
    return (
      <h3 key={key} className="mt-3 font-head text-[15px] font-bold text-text-1 first:mt-0">
        {inner}
      </h3>
    )
  }
  if (level === 3) {
    return (
      <h4 key={key} className="mt-3 text-sm font-bold text-text-1 first:mt-0">
        {inner}
      </h4>
    )
  }
  return (
    <h5 key={key} className="mt-2 text-[13px] font-semibold text-text-1 first:mt-0">
      {inner}
    </h5>
  )
}

function renderSimpleBlock(
  block: string,
  renderCitation: (id: number, key: string) => ReactNode,
  key: string,
): ReactNode {
  const lines = block.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return null

  if (isTable(lines)) {
    const header = parseTableRow(lines[0])
    const rows = lines.slice(2).map(parseTableRow)
    return (
      <div key={key} className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {header.map((cell, c) => (
                <th
                  key={c}
                  className="border border-border bg-bg-2 px-2.5 py-1.5 text-left font-semibold text-text-1"
                >
                  {renderInline(cell, renderCitation, `${key}h${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className="border border-border px-2.5 py-1.5 text-text-2">
                    {renderInline(cell, renderCitation, `${key}r${r}c${c}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (isOrderedList(lines)) {
    return (
      <ol key={key} className="my-2 list-decimal space-y-1.5 pl-5">
        {lines.map((line, j) => (
          <li key={j} className="leading-relaxed">
            {renderInline(line.replace(/^\s*\d+[.)]\s+/, ''), renderCitation, `${key}l${j}`)}
          </li>
        ))}
      </ol>
    )
  }

  if (isBulletList(block)) {
    return (
      <ul key={key} className="my-2 list-none space-y-1.5 pl-0">
        {lines.map((line, j) => {
          const cleaned = line.replace(/^\s*[-*]\s+/, '')
          return (
            <li key={j} className="relative pl-4 leading-relaxed">
              <span className="absolute left-0 top-[0.55em] h-1.5 w-1.5 rounded-full bg-brand-blue-deep" />
              {renderInline(cleaned, renderCitation, `${key}l${j}`)}
            </li>
          )
        })}
      </ul>
    )
  }

  // Paragraphe normal : on respecte les retours à la ligne simples comme
  // des <br> (cas du modèle qui aligne ses bullets sans ligne vide entre).
  const rawLines = block.split('\n')
  return (
    <p key={key} className="leading-relaxed [&:not(:first-child)]:mt-2">
      {rawLines.map((line, j) => (
        <span key={j}>
          {renderInline(line, renderCitation, `${key}l${j}`)}
          {j < rawLines.length - 1 && <br />}
        </span>
      ))}
    </p>
  )
}

function isBulletList(block: string): boolean {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return false
  return lines.every((l) => /^[-*]\s+\S/.test(l))
}

function isOrderedList(lines: string[]): boolean {
  return lines.length > 0 && lines.every((l) => /^\s*\d+[.)]\s+\S/.test(l))
}

// Table GFM : 1re ligne avec des pipes, 2e ligne = séparateur (---|---).
function isTable(lines: string[]): boolean {
  if (lines.length < 2) return false
  if (!lines[0].includes('|')) return false
  const sep = lines[1].trim()
  return /^\|?[\s:|-]+\|?$/.test(sep) && sep.includes('-')
}

function parseTableRow(line: string): string[] {
  const cells = line.split('|').map((c) => c.trim())
  // Retire les cellules vides de bord créées par les pipes d'encadrement.
  if (cells.length && cells[0] === '') cells.shift()
  if (cells.length && cells[cells.length - 1] === '') cells.pop()
  return cells
}

/**
 * Rendu inline : `code`, [liens](https://…), **gras**, *italique*, et les
 * marqueurs [N] de citation. Tokenisé en une seule passe pour garder l'ordre.
 */
function renderInline(
  text: string,
  renderCitation: (id: number, key: string) => ReactNode,
  keyPrefix: string,
): ReactNode[] {
  // Ordre des alternatives : code d'abord (pas de formatage interne), puis
  // lien (avant citation : `[3]` seul ne matche pas faute de parenthèse),
  // puis `**...**` avant `*...*` pour ne pas couper le double-astérisque.
  const re =
    /(`[^`\n]+`)|(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[(\d+)\](?!\w))/g
  const out: ReactNode[] = []
  let last = 0
  let m
  let k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1]) {
      // `code`
      out.push(
        <code
          key={`${keyPrefix}-${k++}`}
          className="rounded border border-border bg-bg-2 px-1 py-0.5 font-mono text-[12px] text-text-1"
        >
          {m[1].slice(1, -1)}
        </code>,
      )
    } else if (m[2]) {
      // [label](https://…) — http(s) uniquement, garanti par la regex.
      out.push(
        <a
          key={`${keyPrefix}-${k++}`}
          href={m[4]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-blue-deep underline underline-offset-2 hover:opacity-80"
        >
          {m[3]}
        </a>,
      )
    } else if (m[5]) {
      // **gras** — inner re-tokenisé (citations dans du gras possibles).
      out.push(
        <strong key={`${keyPrefix}-${k++}`} className="font-semibold text-text-1">
          {renderInline(m[5].slice(2, -2), renderCitation, `${keyPrefix}-${k}`)}
        </strong>,
      )
    } else if (m[6]) {
      // *italique*
      out.push(
        <em key={`${keyPrefix}-${k++}`} className="italic">
          {renderInline(m[6].slice(1, -1), renderCitation, `${keyPrefix}-${k}`)}
        </em>,
      )
    } else if (m[7]) {
      // [N] citation
      const id = Number(m[8])
      out.push(renderCitation(id, `${keyPrefix}-${k++}`))
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
