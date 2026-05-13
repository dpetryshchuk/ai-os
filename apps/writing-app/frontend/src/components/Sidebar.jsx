import { useState, useCallback } from 'react'
import ContextMenu from './ContextMenu'

export default function Sidebar({
  folders,
  essays,
  activeFolder,
  activeSlug,
  onSelectEssay,
  onCreateEssay,
  onDeleteEssay,
  onMoveEssay,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onPull,
  commitMessage,
  onCommitMessageChange,
  onPush,
}) {
  const [collapsed, setCollapsed] = useState({})
  const [contextMenu, setContextMenu] = useState(null)
  const [inlineNew, setInlineNew] = useState(null)
  const [newTitle, setNewTitle] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const openCtx = useCallback((e, items) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }, [])

  function essaysInFolder(folder) {
    return essays.filter(e => e.folder === folder)
  }

  function handleFolderCtx(e, folder) {
    openCtx(e, [
      { label: 'New essay', action: () => { setInlineNew({ folder }); setNewTitle('') } },
      { label: 'Rename', action: () => { setRenaming({ folder }); setRenameValue(folder) } },
      {
        label: 'Delete', action: () => {
          if (essaysInFolder(folder).length > 0) return alert('Remove all essays first')
          if (confirm(`Delete folder "${folder}"?`)) onDeleteFolder(folder)
        }
      },
    ])
  }

  function handleEssayCtx(e, essay) {
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

  function submitNewEssay(folder) {
    if (newTitle.trim()) onCreateEssay(folder, newTitle.trim())
    setInlineNew(null)
    setNewTitle('')
  }

  function submitRename(oldName) {
    if (renameValue.trim() && renameValue !== oldName) onRenameFolder(oldName, renameValue.trim())
    setRenaming(null)
  }

  function submitNewFolder() {
    if (newFolderName.trim()) onCreateFolder(newFolderName.trim())
    setNewFolderMode(false)
    setNewFolderName('')
  }

  return (
    <div className="w-[220px] bg-[#f7f6f3] border-r border-[#e8e5e0] flex flex-col flex-shrink-0 select-none">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-[#e8e5e0] flex items-center justify-between">
        <span className="text-[10px] tracking-[0.1em] text-[#a8a29e] font-semibold uppercase">Essays</span>
        <div className="flex gap-2.5 items-center">
          <button
            onClick={onPull}
            title="Pull from GitHub"
            className="text-[#c4bfb9] hover:text-[#78716c] text-sm leading-none transition-colors"
          >↓</button>
          <button
            onClick={() => { setNewFolderMode(true); setNewFolderName('') }}
            title="New folder"
            className="text-[#c4bfb9] hover:text-[#78716c] text-base leading-none transition-colors"
          >+</button>
        </div>
      </div>

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto py-2">
        {newFolderMode && (
          <input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitNewFolder(); if (e.key === 'Escape') setNewFolderMode(false) }}
            onBlur={() => setNewFolderMode(false)}
            placeholder="folder name"
            className="mx-3 mb-1 w-[calc(100%-24px)] bg-white border border-[#e8e5e0] rounded-md px-2.5 py-1.5 text-xs text-[#1a1916] outline-none focus:border-[#a8a29e]"
          />
        )}
        {folders.map(folder => {
          const isOpen = !collapsed[folder]
          const folderEssays = essaysInFolder(folder)
          return (
            <div key={folder}>
              <div
                className="px-3 py-1.5 flex items-center gap-1.5 cursor-pointer group"
                onClick={() => setCollapsed(c => ({ ...c, [folder]: !c[folder] }))}
                onContextMenu={e => handleFolderCtx(e, folder)}
              >
                <span className="text-[9px] text-[#c4bfb9] w-3 flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
                {renaming?.folder === folder ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitRename(folder); if (e.key === 'Escape') setRenaming(null) }}
                    onBlur={() => submitRename(folder)}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 bg-white border border-[#e8e5e0] rounded px-1.5 py-0.5 text-xs text-[#1a1916] outline-none"
                  />
                ) : (
                  <span className="text-xs text-[#736d65] group-hover:text-[#1a1916] flex-1 font-medium transition-colors">{folder}</span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setInlineNew({ folder }); setNewTitle('') }}
                  className="text-[#c4bfb9] hover:text-[#78716c] text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                >+</button>
              </div>
              {isOpen && (
                <div>
                  {folderEssays.map(essay => (
                    <div
                      key={essay.slug}
                      className={`pl-7 pr-3 py-1.5 text-[12.5px] cursor-pointer transition-colors ${
                        activeFolder === essay.folder && activeSlug === essay.slug
                          ? 'text-[#1a1916] bg-white border-l-2 border-[#a8a29e] font-medium'
                          : 'text-[#9c9590] hover:text-[#1a1916] hover:bg-[#f0ede8]'
                      }`}
                      onClick={() => onSelectEssay(essay.folder, essay.slug)}
                      onContextMenu={e => handleEssayCtx(e, essay)}
                    >
                      {essay.title || essay.slug}
                    </div>
                  ))}
                  {inlineNew?.folder === folder && (
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitNewEssay(folder); if (e.key === 'Escape') setInlineNew(null) }}
                      onBlur={() => setInlineNew(null)}
                      placeholder="Essay title…"
                      className="ml-7 mr-3 my-0.5 w-[calc(100%-52px)] bg-white border border-[#e8e5e0] rounded px-2 py-1 text-xs text-[#1a1916] outline-none"
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer: git push */}
      <div className="border-t border-[#e8e5e0] p-3">
        <input
          value={commitMessage}
          onChange={e => onCommitMessageChange(e.target.value)}
          placeholder="commit message…"
          className="w-full bg-white border border-[#e8e5e0] rounded-md px-2.5 py-1.5 text-[11.5px] text-[#736d65] font-mono outline-none focus:border-[#a8a29e] mb-2 transition-colors placeholder-[#c4bfb9]"
        />
        <button
          onClick={onPush}
          className="w-full bg-[#1a1916] hover:bg-[#292524] text-white rounded-md px-2 py-1.5 text-[11.5px] font-medium tracking-wide cursor-pointer transition-colors"
        >
          ↑ Push to GitHub
        </button>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
