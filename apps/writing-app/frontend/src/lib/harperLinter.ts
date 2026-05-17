import { LocalLinter } from 'harper.js'
import { binaryInlined } from 'harper.js/binaryInlined'
import { linter, type Diagnostic } from '@codemirror/lint'

let instance: LocalLinter | null = null

async function getLinter(): Promise<LocalLinter> {
  if (!instance) {
    instance = new LocalLinter({ binary: binaryInlined })
    await instance.setup()
  }
  return instance
}

export const harperLinter = linter(
  async (view): Promise<Diagnostic[]> => {
    const l = await getLinter()
    const text = view.state.doc.toString()
    if (!text.trim()) return []
    const lints = await l.lint(text, { language: 'markdown' })
    return lints.map(lint => {
      const span = lint.span()
      return {
        from: span.start,
        to: span.end,
        message: lint.message(),
        severity: 'warning' as const,
      }
    })
  },
  { delay: 750 }
)
