// eslint-disable-next-line react-doctor/prefer-dynamic-import
import { ViewPlugin, Decoration, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view'
// eslint-disable-next-line react-doctor/prefer-dynamic-import
import { RangeSetBuilder } from '@codemirror/state'

const WIKI_RE = /\[\[([^\]]+)\]\]/g
const wikiMark = Decoration.mark({ class: 'cm-wiki-link' })

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const { doc, selection } = view.state
  const cursor = selection.main.head
  const text = doc.toString()
  const re = new RegExp(WIKI_RE.source, 'g')
  let match: RegExpExecArray | null
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
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view)
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view)
        }
      }
    },
    { decorations: (v) => v.decorations }
  )
}
