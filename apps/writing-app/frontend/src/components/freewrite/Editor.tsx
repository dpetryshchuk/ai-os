import { useRef } from 'react'

const PLACEHOLDERS = [
  'Begin writing',
  'Pick a thought and go',
  'Start typing',
  "What's on your mind",
  'Just start',
  'Type your first thought',
  'Start with one sentence',
  'Just say it',
]

interface Props {
  text: string
  onChange: (text: string) => void
  fontFamily: string
  fontSize: number
  disabled?: boolean
}

export default function Editor({ text, onChange, fontFamily, fontSize, disabled }: Props) {
  const placeholderRef = useRef(PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)])

  return (
    <div className="flex-1 flex justify-center overflow-y-auto">
      <textarea
        className="w-full outline-none resize-none bg-transparent text-foreground placeholder:text-muted-foreground/40 py-16 px-8"
        style={{
          maxWidth: 650,
          fontFamily,
          fontSize,
          lineHeight: `${fontSize * 1.5}px`,
        }}
        value={text}
        onChange={e => onChange(e.target.value)}
        placeholder={text.trim() === '' ? placeholderRef.current : ''}
        disabled={disabled}
        autoFocus
        spellCheck
      />
    </div>
  )
}
