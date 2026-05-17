import { Link } from 'react-router-dom'

export default function Freewrite() {
  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Freewrite</h1>
        <Link to="/" className="text-sm underline opacity-50">← back to essays</Link>
      </div>
    </div>
  )
}
