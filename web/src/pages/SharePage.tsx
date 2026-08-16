import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { pb, extractUrl, type BoardRecord } from '../lib/pb'

/**
 * Web Share Target landing page: Android/desktop PWA shares land here with
 * ?url= / ?text= / ?title=. The user picks a board and the shared link opens
 * that board with the add-dialog prefilled.
 */
export default function SharePage() {
  const [searchParams] = useSearchParams()
  const [boards, setBoards] = useState<BoardRecord[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const sharedUrl =
    extractUrl(searchParams.get('url') || '') ||
    extractUrl(searchParams.get('text') || '') ||
    extractUrl(searchParams.get('title') || '')

  useEffect(() => {
    pb.collection('boards')
      .getFullList<BoardRecord>({ sort: '-updated' })
      .then(setBoards)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function pick(boardId: string) {
    navigate(
      sharedUrl ? `/b/${boardId}?add=${encodeURIComponent(sharedUrl)}` : `/b/${boardId}`,
      { replace: true },
    )
  }

  async function createAndPick() {
    const board = await pb.collection('boards').create<BoardRecord>({
      name: 'Untitled board',
      owner: pb.authStore.record?.id,
    })
    await pick(board.id)
  }

  return (
    <div className="share-wrap">
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Add to a board</h1>
      {sharedUrl ? (
        <p className="muted" style={{ wordBreak: 'break-all' }}>
          {sharedUrl}
        </p>
      ) : (
        <p className="muted">Nothing shareable was received — pick a board to open it.</p>
      )}

      {loading ? (
        <p className="muted" style={{ marginTop: 20 }}>
          Loading boards…
        </p>
      ) : (
        <div className="share-board-list">
          {boards.map((b) => (
            <button key={b.id} className="share-board-btn" onClick={() => void pick(b.id)}>
              🛍️ {b.name}
            </button>
          ))}
          <button className="share-board-btn" onClick={() => void createAndPick()}>
            + New board
          </button>
        </div>
      )}
    </div>
  )
}
