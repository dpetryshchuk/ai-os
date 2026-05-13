import 'dotenv/config'
import express, { Request, Response } from 'express'
import path from 'path'
import { listEssays, readEssay, writeEssay, createEssay, deleteEssay, moveEssay } from './src/essays'
import { listFolders, createFolder, renameFolder, deleteFolder } from './src/folders'
import { gitPull, gitPush } from './src/git'

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'public')))

function ok(res: Response, data: object = {}): void {
  res.json({ ok: true, ...data })
}

function err(res: Response, e: Error, status = 400): void {
  res.status(status).json({ ok: false, error: e.message })
}

// Essays
app.get('/api/essays', (_req: Request, res: Response) => {
  try { ok(res, { essays: listEssays() }) } catch (e) { err(res, e as Error) }
})

app.get('/api/essays/:folder/:slug', (req: Request, res: Response) => {
  try {
    const essay = readEssay(req.params.folder, req.params.slug)
    if (!essay) return void res.status(404).json({ ok: false, error: 'Not found' })
    ok(res, { essay })
  } catch (e) { err(res, e as Error) }
})

app.put('/api/essays/:folder/:slug', (req: Request, res: Response) => {
  try {
    const { frontmatter, body } = req.body
    writeEssay(req.params.folder, req.params.slug, frontmatter, body)
    ok(res)
  } catch (e) { err(res, e as Error) }
})

app.post('/api/essays', (req: Request, res: Response) => {
  try {
    const { folder, title } = req.body
    if (!folder || !title) return void err(res, new Error('folder and title required'))
    const essay = createEssay(folder, title)
    ok(res, { essay })
  } catch (e) { err(res, e as Error) }
})

app.delete('/api/essays/:folder/:slug', (req: Request, res: Response) => {
  try { deleteEssay(req.params.folder, req.params.slug); ok(res) } catch (e) { err(res, e as Error) }
})

app.patch('/api/essays/:folder/:slug/move', (req: Request, res: Response) => {
  try {
    moveEssay(req.params.folder, req.params.slug, req.body.folder)
    ok(res)
  } catch (e) { err(res, e as Error) }
})

// Folders
app.get('/api/folders', (_req: Request, res: Response) => {
  try { ok(res, { folders: listFolders() }) } catch (e) { err(res, e as Error) }
})

app.post('/api/folders', (req: Request, res: Response) => {
  try { createFolder(req.body.name); ok(res) } catch (e) { err(res, e as Error) }
})

app.patch('/api/folders/:folder', (req: Request, res: Response) => {
  try { renameFolder(req.params.folder, req.body.name); ok(res) } catch (e) { err(res, e as Error) }
})

app.delete('/api/folders/:folder', (req: Request, res: Response) => {
  try { deleteFolder(req.params.folder); ok(res) } catch (e) { err(res, e as Error) }
})

// Git
app.post('/api/git/pull', (_req: Request, res: Response) => {
  try { ok(res, { output: gitPull() }) } catch (e) { err(res, e as Error) }
})

app.post('/api/git/push', (req: Request, res: Response) => {
  try { ok(res, { output: gitPush(req.body.message) }) } catch (e) { err(res, e as Error) }
})

// SPA fallback
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

export { app }

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 4112
  app.listen(PORT, () => console.log(`writing-app on ${PORT}`))
}
