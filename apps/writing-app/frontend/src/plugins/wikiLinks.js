import { ViewPlugin, Decoration } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

const WIKI_RE = /\[\[([^\]]+)\]\]/g
const wikiMark = Decoration.mark({ class: 'cm-wiki-link' })

function buildDecorations(view) {
  const builder = new RangeSetBuilder()
  const { doc, selection } = view.state
  const cursor = selection.main.head
  const text = doc.toString()
  const re = new RegExp(WIKI_RE.source, 'g')
  let match
  while ((match = re.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (cursor > from && cursor < to) continue
    builder.add(from, to, wikiMark)
  }
  return builder.finish()
}

export function wikiLinksExtension() {
  return ViewPlugin.fromClass(
    class {
      constructor(view) { this.decorations = buildDecorations(view) }
      update(update) {
        if (update.docChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view)
        }
      }
    },
    { decorations: v => v.decorations }
  )
}
