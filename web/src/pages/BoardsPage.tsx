import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pb, type BoardRecord } from '../lib/pb'

const BOARD_EMOJIS = ['🛍️', '👗', '🏠', '🎁', '✨', '👟', '📱', '🪴', '🎨', '⌚']

function boardEmoji(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return BOARD_EMOJIS[h % BOARD_EMOJIS.length]
}

export default function BoardsPage() {
  const [boards, setBoards] = useState<BoardRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    pb.collection('boards')
      .getFullList<BoardRecord>({ sort: '-updated' })
      .then((list) => {
        if (!cancelled) setBoards(list)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (renamingId) renameRef.current?.select()
  }, [renamingId])

  async function createBoard() {
    const board = await pb.collection('boards').create<BoardRecord>({
      name: 'Untitled board',
      owner: pb.authStore.record?.id,
    })
    navigate(`/b/${board.id}`)
  }

  function startRename(board: BoardRecord) {
    setRenamingId(board.id)
    setRenameValue(board.name)
  }

  async function commitRename() {
    const id = renamingId
    if (!id) return
    setRenamingId(null)
    const name = renameValue.trim()
    const board = boards.find((b) => b.id === id)
    if (!board || !name || name === board.name) return
    setBoards((bs) => bs.map((b) => (b.id === id ? { ...b, name } : b)))
    try {
      await pb.collection('boards').update(id, { name })
    } catch {
      setBoards((bs) => bs.map((b) => (b.id === id ? { ...b, name: board.name } : b)))
    }
  }

  async function deleteBoard(board: BoardRecord) {
    if (!confirm(`Delete “${board.name}” and everything on it?`)) return
    setBoards((bs) => bs.filter((b) => b.id !== board.id))
    try {
      await pb.collection('boards').delete(board.id)
    } catch {
      setBoards((bs) => [...bs, board])
    }
  }

  function logout() {
    pb.authStore.clear()
    navigate('/login')
  }

  return (
    <div>
      <header className="topbar">
        <div className="topbar-logo">
          <img src="/icon.svg" alt="" />
          Shopping Board
        </div>
        <div className="topbar-spacer" />
        <span className="muted">{pb.authStore.record?.email as string}</span>
        <button className="btn btn-ghost" onClick={logout}>
          Sign out
        </button>
      </header>

      <main className="boards-wrap">
        <div className="boards-head">
          <h1>My boards</h1>
          <button className="btn btn-primary" onClick={createBoard}>
            + New board
          </button>
        </div>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : boards.length === 0 ? (
          <div className="empty-state">
            <div className="big">🛍️</div>
            <p>No boards yet.</p>
            <p style={{ marginTop: 6 }}>
              Create your first board and start collecting products you love.
            </p>
            <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={createBoard}>
              + Create a board
            </button>
          </div>
        ) : (
          <div className="boards-grid">
            {boards.map((board) => (
              <div
                key={board.id}
                className="board-tile"
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (renamingId !== board.id) navigate(`/b/${board.id}`)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renamingId !== board.id) navigate(`/b/${board.id}`)
                }}
              >
                <div className="board-tile-emoji">{boardEmoji(board.id)}</div>
                {renamingId === board.id ? (
                  <input
                    ref={renameRef}
                    className="board-tile-rename"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="board-tile-name">{board.name}</div>
                )}
                <div className="board-tile-meta">
                  Updated {new Date(board.updated).toLocaleDateString()}
                </div>
                <div className="board-tile-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-icon btn-ghost"
                    title="Rename board"
                    onClick={() => startRename(board)}
                  >
                    ✏️
                  </button>
                  <button
                    className="btn btn-icon btn-ghost"
                    title="Delete board"
                    onClick={() => deleteBoard(board)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
