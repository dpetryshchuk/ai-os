import { useCallback, useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ChevronRight, Mic, MicOff, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

const STREAM_URL = '/api/jobsearch/agents/stream'

const THINKING = [
  'Cogitating...', 'Ruminating...', 'Scheming...', 'Noodling...',
  'Percolating...', 'Concocting...', 'Finagling...', 'Wrangling...',
  'Deliberating...', 'Marinating...', 'Stewing...', 'Palavering...',
]

function randomThinking(): string {
  return THINKING[Math.floor(Math.random() * THINKING.length)]
}

interface ToolCallData {
  toolCallId: string
  toolName: string
  args: unknown
  result?: unknown
}

interface Message {
  id: string
  role: 'user' | 'agent' | 'system'
  text: string
  thinking?: boolean
  toolCalls?: ToolCallData[]
}

interface Stats {
  sent: number
  connected: number
  replied: number
  converted: number
  today: number
}

function ToolCallCard({ call }: { call: ToolCallData }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-border text-xs overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
      >
        <ChevronRight size={10} className={cn('text-muted-foreground transition-transform shrink-0', open && 'rotate-90')} />
        <span className="font-mono text-[10px] font-medium text-muted-foreground tracking-wide">{call.toolName}</span>
      </button>
      {open && (
        <div className="border-t border-border p-2.5 flex flex-col gap-2 bg-muted/20">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Args</p>
            <pre className="font-mono text-[10px] text-foreground/70 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(call.args, null, 2)}</pre>
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Result</p>
            <pre className="font-mono text-[10px] text-foreground/70 overflow-x-auto whitespace-pre-wrap">
              {call.result !== undefined ? JSON.stringify(call.result, null, 2) : '—'}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'system') {
    return <div className="flex justify-center"><p className="text-xs text-muted-foreground py-1">{msg.text}</p></div>
  }
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[680px] w-full flex flex-col items-end gap-1">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground px-1">You</p>
          <div className="bg-muted rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[680px] w-full flex flex-col items-start gap-1">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground px-1">Ima</p>
        <div className="rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed border border-border bg-card w-full">
          {msg.thinking ? (
            <span className="text-muted-foreground text-sm animate-pulse">{msg.text || 'Thinking...'}</span>
          ) : (
            <>
              <div
                className="prose prose-sm prose-neutral max-w-none"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(msg.text) as string) }}
              />
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {msg.toolCalls.map(c => <ToolCallCard key={c.toolCallId} call={c} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Outreach() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const activeThinkingRef = useRef(0)
  const historyRef = useRef<{ role: string; content: string }[]>([])

  const [listening, setListening] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  useEffect(() => {
    fetch('/api/outreach/stats')
      .then(r => r.json())
      .then(d => setStats(d.stats ?? null))
      .catch(() => null)
  }, [messages]) // refresh stats after each exchange

  function _webSpeechFallback() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SpeechRec) { alert('Microphone not available'); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SpeechRec()
    rec.continuous = false; rec.interimResults = false; rec.lang = 'en-US'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => { setInput(prev => prev ? prev + ' ' + e.results[0][0].transcript : e.results[0][0].transcript); setListening(false) }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  const toggleVoice = useCallback(() => {
    if (listening) {
      mediaRecorderRef.current?.stop()
      setListening(false)
      return
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setListening(false)
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const form = new FormData()
        form.append('file', blob, 'voice.webm')
        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: form })
          const data = await res.json()
          if (data.transcript) setInput(prev => prev ? prev + ' ' + data.transcript : data.transcript)
        } catch {
          // server whisper unavailable — fall back to Web Speech API
          _webSpeechFallback()
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setListening(true)

      // Auto-stop after 30s
      setTimeout(() => recorder.state === 'recording' && recorder.stop(), 30000)
    }).catch(() => _webSpeechFallback())
  }, [listening])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function adjustHeight(): void {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  const updateMessage = useCallback((id: string, updater: (m: Message) => Message) => {
    setMessages(prev => prev.map(m => m.id === id ? updater(m) : m))
  }, [])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    const userId = `u${Date.now()}`
    const agentId = `a${Date.now()}`
    setMessages(prev => [
      ...prev,
      { id: userId, role: 'user', text },
      { id: agentId, role: 'agent', text: randomThinking(), thinking: true, toolCalls: [] },
    ])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setStreaming(true)
    const thinkingInterval = setInterval(() => {
      activeThinkingRef.current = (activeThinkingRef.current + 1) % THINKING.length
      updateMessage(agentId, m => m.thinking ? { ...m, text: THINKING[activeThinkingRef.current] } : m)
    }, 600)
    historyRef.current = [...historyRef.current, { role: 'user', content: text }]
    try {
      const res = await fetch(STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyRef.current }),
      })
      clearInterval(thinkingInterval)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let textContent = ''
      let buffer = ''
      let textStarted = false
      const toolCallMap: Record<string, ToolCallData> = {}
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          const trimmed = line.slice(6).trim()
          if (!trimmed || trimmed === '[DONE]') continue
          let chunk: { type?: string; payload?: Record<string, unknown> }
          try { chunk = JSON.parse(trimmed) } catch { continue }
          if (chunk.type === 'text-delta' && chunk.payload?.text) {
            textContent += chunk.payload.text as string
            if (!textStarted) { textStarted = true; updateMessage(agentId, m => ({ ...m, text: textContent, thinking: false })) }
            else updateMessage(agentId, m => ({ ...m, text: textContent }))
          } else if (chunk.type === 'tool-call' && chunk.payload) {
            const { toolCallId, toolName, args } = chunk.payload as unknown as ToolCallData
            toolCallMap[toolCallId] = { toolCallId, toolName, args, result: undefined }
            updateMessage(agentId, m => ({ ...m, toolCalls: Object.values(toolCallMap) }))
          } else if (chunk.type === 'tool-result' && chunk.payload) {
            const { toolCallId, result } = chunk.payload as { toolCallId: string; result: unknown }
            if (toolCallMap[toolCallId]) {
              toolCallMap[toolCallId] = { ...toolCallMap[toolCallId], result }
              updateMessage(agentId, m => ({ ...m, toolCalls: Object.values(toolCallMap) }))
            }
          } else if (chunk.type === 'error' && chunk.payload?.message) {
            updateMessage(agentId, m => ({ ...m, text: `Error: ${chunk.payload!.message}`, thinking: false }))
          }
        }
      }
      updateMessage(agentId, m => m.thinking ? { ...m, text: textContent, thinking: false } : m)
      if (textContent) historyRef.current = [...historyRef.current, { role: 'assistant', content: textContent }]
    } catch (err) {
      clearInterval(thinkingInterval)
      historyRef.current = historyRef.current.slice(0, -1)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      updateMessage(agentId, m => ({ ...m, text: `Error: ${msg}`, thinking: false }))
    } finally {
      setStreaming(false)
    }
  }, [input, streaming, updateMessage])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
    if (e.altKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); toggleVoice() }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Compact stats strip */}
      {stats && (
        <div className="shrink-0 border-b border-border px-6 py-2 flex gap-6 text-xs text-muted-foreground bg-background/80">
          <span>Today <strong className="text-foreground">{stats.today}</strong></span>
          <span>Connected <strong className="text-blue-400">{stats.connected}</strong></span>
          <span>Replied <strong className="text-amber-400">{stats.replied}</strong></span>
          <span>Converted <strong className="text-green-400">{stats.converted}</strong></span>
          <span>Pipeline <strong className="text-foreground">{stats.sent + stats.connected + stats.replied}</strong></span>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 text-center">
          <div className="size-10 rounded-full bg-foreground/10 flex items-center justify-center">
            <div className="size-3 rounded-full bg-foreground/60" />
          </div>
          <div>
            <p className="text-xl font-semibold tracking-tight">LinkedIn Outreach</p>
            <p className="text-sm text-muted-foreground mt-1">Log contacts, update statuses, check your funnel — just tell Ima.</p>
          </div>
          <div className="flex flex-col gap-2 text-xs text-muted-foreground max-w-sm">
            <p className="italic">"I just messaged Sarah Chen at Stripe about a contract role"</p>
            <p className="italic">"Mark John Davis as connected, he replied"</p>
            <p className="italic">"How's my outreach looking this week?"</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-[680px] mx-auto flex flex-col gap-4">
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      <div className="border-t border-border bg-background px-4 py-3 shrink-0">
        <div className="max-w-[680px] mx-auto">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { setInput(e.target.value); adjustHeight() }}
              onKeyDown={handleKeyDown}
              placeholder="Tell Ima about your outreach..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all min-h-[48px] max-h-[200px]"
            />
            <button
              onClick={toggleVoice}
              className={cn(
                'shrink-0 rounded-lg p-2 transition-colors',
                listening ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
              title="Voice input (Alt+M)"
              type="button"
            >
              {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </button>
            <button
              onClick={send}
              disabled={streaming || !input.trim()}
              className="shrink-0 flex items-center justify-center size-10 rounded-xl bg-foreground text-background disabled:opacity-40 hover:opacity-80 transition-opacity"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="mt-2 px-1 text-[10px] text-muted-foreground font-mono">Enter to send · Shift+Enter for newline</p>
        </div>
      </div>
    </div>
  )
}
