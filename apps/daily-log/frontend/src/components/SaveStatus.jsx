export default function SaveStatus({ status }) {
  const label = {
    idle: '',
    saving: 'Savingâ€¦',
    saved: 'Saved',
    error: 'Save failed'
  }[status] ?? ''

  if (!label) return null

  return (
    <div className="text-[11px] text-muted-foreground pointer-events-none select-none">
      {label}
    </div>
  )
}
