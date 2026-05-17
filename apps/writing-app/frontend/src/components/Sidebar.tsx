import { useReducer, useCallback } from 'react'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import type { Essay } from '../lib/api'

interface SidebarProps {
  folders: string[]
  essays: Essay[]
  activeFolder: string | null
  activeSlug: string | null
  onSelectEssay: (folder: string, slug: string) => void
  onCreateEssay: (folder: string, title: string) => void
  onDeleteEssay: (folder: string, slug: string) => void
  onMoveEssay: (folder: string, slug: string, targetFolder: string) => void
  onCreateFolder: (name: string) => void
  onRenameFolder: (oldName: string, newName: string) => void
  onDeleteFolder: (name: string) => void
  onPull: () => void
  commitMessage: string
  onCommitMessageChange: (msg: string) => void
  onPush: () => void
}

interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

interface InlineNew {
  folder: string
}

interface Renaming {
  folder: string
}

type SidebarState = {
  collapsed: Record<string, boolean>
  contextMenu: ContextMenuState | null
  inlineNew: InlineNew | null
  newTitle: string
  renaming: Renaming | null
  renameValue: string
  newFolderMode: boolean
  newFolderName: string
}

type SidebarAction =
  | { type: 'toggle_collapse'; folder: string }
  | { type: 'set_context_menu'; menu: ContextMenuState | null }
  | { type: 'set_inline_new'; folder: string | null; title?: string }
  | { type: 'set_new_title'; title: string }
  | { type: 'set_renaming'; folder: string | null; value?: string }
  | { type: 'set_rename_value'; value: string }
  | { type: 'set_new_folder_mode'; active: boolean; name?: string }
  | { type: 'set_new_folder_name'; name: string }

function sidebarReducer(state: SidebarState, action: SidebarAction): SidebarState {
  switch (action.type) {
    case 'toggle_collapse':
      return { ...state, collapsed: { ...state.collapsed, [action.folder]: !state.collapsed[action.folder] } }
    case 'set_context_menu':
      return { ...state, contextMenu: action.menu }
    case 'set_inline_new':
      return { ...state, inlineNew: action.folder ? { folder: action.folder } : null, newTitle: action.title ?? '' }
    case 'set_new_title':
      return { ...state, newTitle: action.title }
    case 'set_renaming':
      return { ...state, renaming: action.folder ? { folder: action.folder } : null, renameValue: action.value ?? '' }
    case 'set_rename_value':
      return { ...state, renameValue: action.value }
    case 'set_new_folder_mode':
      return { ...state, newFolderMode: action.active, newFolderName: action.name ?? '' }
    case 'set_new_folder_name':
      return { ...state, newFolderName: action.name }
  }
}

export default function Sidebar({
  folders, essays, activeFolder, activeSlug,
  onSelectEssay, onCreateEssay, onDeleteEssay, onMoveEssay,
  onCreateFolder, onRenameFolder, onDeleteFolder,
  onPull, commitMessage, onCommitMessageChange, onPush,
}: SidebarProps) {
  const [state, dispatch] = useReducer(sidebarReducer, {
    collapsed: {},
    contextMenu: null,
    inlineNew: null,
    newTitle: '',
    renaming: null,
    renameValue: '',
    newFolderMode: false,
    newFolderName: '',
  })
  const { collapsed, contextMenu, inlineNew, newTitle, renaming, renameValue, newFolderMode, newFolderName } = state

  const openCtx = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault()
    dispatch({ type: 'set_context_menu', menu: { x: e.clientX, y: e.clientY, items } })
  }, [])

  function essaysInFolder(folder: string) {
    return essays.filter(e => e.folder === folder)
  }

  function handleFolderCtx(e: React.MouseEvent, folder: string) {
    openCtx(e, [
      { label: 'New essay', action: () => dispatch({ type: 'set_inline_new', folder, title: '' }) },
      { label: 'Rename', action: () => dispatch({ type: 'set_renaming', folder, value: folder }) },
      {
        label: 'Delete', action: () => {
          if (essaysInFolder(folder).length > 0) return alert('Remove all essays first')
          if (confirm(`Delete folder "${folder}"?`)) onDeleteFolder(folder)
        }
      },
    ])
  }

  function handleEssayCtx(e: React.MouseEvent, essay: Essay) {
    openCtx(e, [
      {
        label: 'Move to…', action: () => {
          const target = prompt('Move to folder:', essay.folder)
          if (target && target !== essay.folder) onMoveEssay(essay.folder, essay.slug, target)
        }
      },
      {
        label: 'Delete', action: () => {
          if (confirm(`Delete "${essay.title || essay.slug}"?`)) onDeleteEssay(essay.folder, essay.slug)
        }
      },
    ])
  }

  function submitNewEssay(folder: string) {
    if (newTitle.trim()) onCreateEssay(folder, newTitle.trim())
    dispatch({ type: 'set_inline_new', folder: null })
  }

  function submitRename(oldName: string) {
    if (renameValue.trim() && renameValue !== oldName) onRenameFolder(oldName, renameValue.trim())
    dispatch({ type: 'set_renaming', folder: null })
  }

  function submitNewFolder() {
    if (newFolderName.trim()) onCreateFolder(newFolderName.trim())
    dispatch({ type: 'set_new_folder_mode', active: false })
  }

  return (
    <div className="w-[220px] bg-background border-r border-border flex flex-col flex-shrink-0 select-none">
      <div className="px-4 py-3.5 border-b border-border flex items-center justify-between">
        <span className="text-[10px] tracking-[0.1em] text-[#a8a29e] font-semibold uppercase">Essays</span>
        <div className="flex gap-2.5 items-center">
          <button onClick={onPull} title="Pull from GitHub" className="text-muted-foreground hover:text-[#78716c] text-sm leading-none transition-colors">↓</button>
          <button onClick={() => dispatch({ type: 'set_new_folder_mode', active: true, name: '' })} title="New folder" className="text-muted-foreground hover:text-[#78716c] text-base leading-none transition-colors">+</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {newFolderMode && (
          <input
            value={newFolderName}
            onChange={e => dispatch({ type: 'set_new_folder_name', name: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') submitNewFolder(); if (e.key === 'Escape') dispatch({ type: 'set_new_folder_mode', active: false }) }}
            onBlur={() => dispatch({ type: 'set_new_folder_mode', active: false })}
            placeholder="folder name"
            className="mx-3 mb-1 w-[calc(100%-24px)] bg-white border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-[#a8a29e]"
          />
        )}
        {folders.map(folder => {
          const isOpen = !collapsed[folder]
          const folderEssays = essaysInFolder(folder)
          return (
            <div key={folder}>
              <div
                role="button"
                tabIndex={0}
                className="px-3 py-1.5 flex items-center gap-1.5 cursor-pointer group"
                onClick={() => dispatch({ type: 'toggle_collapse', folder })}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') dispatch({ type: 'toggle_collapse', folder }) }}
                onContextMenu={e => handleFolderCtx(e, folder)}
              >
                <span className="text-[9px] text-muted-foreground w-3 flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
                {renaming?.folder === folder ? (
                  <input
                    value={renameValue}
                    onChange={e => dispatch({ type: 'set_rename_value', value: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') submitRename(folder); if (e.key === 'Escape') dispatch({ type: 'set_renaming', folder: null }) }}
                    onBlur={() => submitRename(folder)}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 bg-white border border-border rounded px-1.5 py-0.5 text-xs text-foreground outline-none"
                  />
                ) : (
                  <span className="text-xs text-[#736d65] group-hover:text-foreground flex-1 font-medium transition-colors">{folder}</span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); dispatch({ type: 'set_inline_new', folder, title: '' }) }}
                  className="text-muted-foreground hover:text-[#78716c] text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                >+</button>
              </div>
              {isOpen && (
                <div>
                  {folderEssays.map(essay => (
                    <div
                      key={essay.slug}
                      role="button"
                      tabIndex={0}
                      className={`pl-7 pr-3 py-1.5 text-[12.5px] cursor-pointer transition-colors ${
                        activeFolder === essay.folder && activeSlug === essay.slug
                          ? 'text-foreground bg-white border-l-2 border-[#a8a29e] font-medium'
                          : 'text-[#9c9590] hover:text-foreground hover:bg-muted'
                      }`}
                      onClick={() => onSelectEssay(essay.folder, essay.slug)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelectEssay(essay.folder, essay.slug) }}
                      onContextMenu={e => handleEssayCtx(e, essay)}
                    >
                      {essay.title || essay.slug}
                    </div>
                  ))}
                  {inlineNew?.folder === folder && (
                    <input
                      value={newTitle}
                      onChange={e => dispatch({ type: 'set_new_title', title: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') submitNewEssay(folder); if (e.key === 'Escape') dispatch({ type: 'set_inline_new', folder: null }) }}
                      onBlur={() => dispatch({ type: 'set_inline_new', folder: null })}
                      placeholder="Essay title…"
                      className="ml-7 mr-3 my-0.5 w-[calc(100%-52px)] bg-white border border-border rounded px-2 py-1 text-xs text-foreground outline-none"
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="border-t border-border p-3">
        <input
          value={commitMessage}
          onChange={e => onCommitMessageChange(e.target.value)}
          placeholder="commit message…"
          className="w-full bg-white border border-border rounded-md px-2.5 py-1.5 text-[11.5px] text-[#736d65] font-mono outline-none focus:border-[#a8a29e] mb-2 transition-colors placeholder:text-muted-foreground"
        />
        <button
          onClick={onPush}
          className="w-full bg-foreground hover:bg-foreground/90 text-white rounded-md px-2 py-1.5 text-[11.5px] font-medium tracking-wide cursor-pointer transition-colors"
        >
          ↑ Push to GitHub
        </button>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => dispatch({ type: 'set_context_menu', menu: null })}
        />
      )}
    </div>
  )
}
