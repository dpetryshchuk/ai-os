import { useRef, useEffect } from 'react'

const CHATGPT_PROMPT = `below is my journal entry. wyt? talk through it with me like a friend. don't therapize me and give me a whole breakdown, don't repeat my thoughts with headings. really take all of this, and tell me back stuff truly as if you're an old homie. Keep it casual, dont say yo, help me make new connections i don't see, comfort, validate, challenge, all of it. dont be afraid to say a lot. format with markdown headings if needed. do not just go through every single thing i say, and say it back to me. you need to proccess everything i say, make connections i don't see, and deliver it all back to me as a story that makes me feel what you think i wanna feel. thats what the best therapists do. ideally, you're style/tone should sound like the user themselves. it's as if the user is hearing their own tone but it should still feel different, because you have different things to say and don't just repeat back what they say. else, start by saying, 'hey, thanks for showing me this. my thoughts:' my entry:`

const CLAUDE_PROMPT = `Take a look at my journal entry below. I'd like you to analyze it and respond with deep insight that feels personal, not clinical. Imagine you're not just a friend, but a mentor who truly gets both my tech background and my psychological patterns. I want you to uncover the deeper meaning and emotional undercurrents behind my scattered thoughts. Keep it casual, dont say yo, help me make new connections i don't see, comfort, validate, challenge, all of it. dont be afraid to say a lot. format with markdown headings if needed. Use vivid metaphors and powerful imagery to help me see what I'm really building. Organize your thoughts with meaningful headings that create a narrative journey through my ideas. Don't just validate my thoughts - reframe them in a way that shows me what I'm really seeking beneath the surface. Go beyond the product concepts to the emotional core of what I'm trying to solve. Be willing to be profound and philosophical without sounding like you're giving therapy. I want someone who can see the patterns I can't see myself and articulate them in a way that feels like an epiphany. Start with 'hey, thanks for showing me this. my thoughts:' and then use markdown headings to structure your response. Here's my entry:`

interface Props {
  text: string
  onClose: () => void
}

export default function ChatPopover({ text, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const tooShort = text.replace(/\s/g, '').length < 350

  function openChatGPT() {
    window.open(`https://chat.openai.com/?prompt=${encodeURIComponent(CHATGPT_PROMPT + '\n\n' + text)}`, '_blank', 'noopener,noreferrer')
    onClose()
  }

  function openClaude() {
    window.open(`https://claude.ai/new?q=${encodeURIComponent(CLAUDE_PROMPT + '\n\n' + text)}`, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-52 rounded-lg border border-border bg-card shadow-lg p-3 text-sm"
    >
      {tooShort ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Please free write for at minimum 5 minutes first. Then click this. Trust.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <button onClick={openChatGPT} className="w-full text-left px-2 py-1.5 rounded hover:bg-muted transition-colors">
            ChatGPT
          </button>
          <div className="border-t border-border my-0.5" />
          <button onClick={openClaude} className="w-full text-left px-2 py-1.5 rounded hover:bg-muted transition-colors">
            Claude
          </button>
        </div>
      )}
    </div>
  )
}
