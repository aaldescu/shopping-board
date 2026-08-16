import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { pb, extractUrl, type BoardRecord, type ItemRecord } from '../lib/pb'
import ItemCard from '../components/ItemCard'
import ItemDialog, { type DialogState } from '../components/ItemDialog'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const GRID = 24

interface View {
  x: number
  y: number
  s: number
}

type Gesture =
  | { type: 'pan' }
  | { type: 'pinch'; prevDist?: number; prevMid?: { x: number; y: number } }
  | { type: 'item'; id: string; moved: boolean }
  | { type: 'resize'; id: string; moved: boolean }
  | null

const clampZoom = (s: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s))

export default function BoardPage() {
  const { boardId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [board, setBoard] = useState<BoardRecord | null>(null)
  const [items, setItems] = useState<ItemRecord[]>([])
  const [view, setView] = useState<View>({ x: 0, y: 0, s: 1 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [hint, setHint] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const viewportRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const itemsRef = useRef(items)
  itemsRef.current = items
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gestureRef = useRef<Gesture>(null)
  // Re-render when the active gesture targets an item, to toggle its style.
  const [draggingId, setDraggingId] = useState<string | null>(null)

  /* ---------- data loading ---------- */

  useEffect(() => {
    let cancelled = false
    setBoard(null)
    setItems([])
    setNotFound(false)

    pb.collection('boards')
      .getOne<BoardRecord>(boardId)
      .then((b) => {
        if (cancelled) return
        setBoard(b)
        setTitleDraft(b.name)
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })

    pb.collection('items')
      .getFullList<ItemRecord>({ filter: pb.filter('board = {:id}', { id: boardId }), sort: 'created' })
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [boardId])

  // Live updates so a board shared across devices stays in sync.
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    pb.collection('items')
      .subscribe<ItemRecord>('*', (e) => {
        if (e.record.board !== boardId) return
        setItems((prev) => {
          if (e.action === 'create') {
            return prev.some((i) => i.id === e.record.id) ? prev : [...prev, e.record]
          }
          if (e.action === 'delete') {
            return prev.filter((i) => i.id !== e.record.id)
          }
          // Skip echo updates for the card being dragged right now.
          const g = gestureRef.current
          if (g && (g.type === 'item' || g.type === 'resize') && g.id === e.record.id) {
            return prev
          }
          return prev.map((i) => (i.id === e.record.id ? e.record : i))
        })
      })
      .then((un) => {
        unsubscribe = un
      })
      .catch(() => {})
    return () => unsubscribe?.()
  }, [boardId])

  // One-time gesture hint.
  useEffect(() => {
    if (!localStorage.getItem('sb_hint_shown')) {
      setHint(true)
      localStorage.setItem('sb_hint_shown', '1')
      const t = setTimeout(() => setHint(false), 5000)
      return () => clearTimeout(t)
    }
  }, [])

  // Shared / deep-linked URL → open the add dialog prefilled.
  useEffect(() => {
    const add = searchParams.get('add')
    if (add) {
      setDialog({ mode: 'add', prefillUrl: add, spawn: viewCenterWorld() })
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  /* ---------- helpers ---------- */

  function viewCenterWorld(): { x: number; y: number } {
    const rect = viewportRef.current?.getBoundingClientRect()
    const v = viewRef.current
    const cx = (rect ? rect.width / 2 : 300) - 130 * v.s
    const cy = (rect ? rect.height / 2 : 300) - 140 * v.s
    return { x: (cx - v.x) / v.s, y: (cy - v.y) / v.s }
  }

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const px = clientX - (rect?.left ?? 0)
    const py = clientY - (rect?.top ?? 0)
    setView((v) => {
      const s = clampZoom(v.s * factor)
      const k = s / v.s
      return { s, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
    })
  }, [])

  function persistItemGeometry(id: string) {
    const item = itemsRef.current.find((i) => i.id === id)
    if (!item) return
    pb.collection('items')
      .update(id, { x: Math.round(item.x), y: Math.round(item.y), w: Math.round(item.w || 260) })
      .catch(() => {})
  }

  function bringToFront(id: string) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id)
      if (idx < 0 || idx === prev.length - 1) return prev
      const next = prev.slice()
      const [it] = next.splice(idx, 1)
      next.push(it)
      return next
    })
  }

  /* ---------- wheel zoom / trackpad ---------- */

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01))
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    // Safari pinch gesture events would otherwise zoom the page.
    const prevent = (e: Event) => e.preventDefault()
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', prevent)
    el.addEventListener('gesturechange', prevent)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', prevent)
      el.removeEventListener('gesturechange', prevent)
    }
  }, [zoomAt])

  /* ---------- pointer gestures (pan / pinch / drag / resize) ---------- */

  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement
    if (target.closest('[data-ui]')) return

    viewportRef.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2) {
      // Second finger down → switch to pinch/pan navigation.
      const g = gestureRef.current
      if (g && (g.type === 'item' || g.type === 'resize')) {
        persistItemGeometry(g.id)
        setDraggingId(null)
      }
      gestureRef.current = { type: 'pinch' }
      return
    }
    if (pointers.current.size > 2) return

    const cardEl = target.closest('[data-item-id]') as HTMLElement | null
    if (cardEl) {
      const id = cardEl.dataset.itemId!
      const isResize = !!target.closest('[data-resize]')
      gestureRef.current = isResize
        ? { type: 'resize', id, moved: false }
        : { type: 'item', id, moved: false }
      setSelectedId(id)
      bringToFront(id)
      setDraggingId(id)
    } else {
      gestureRef.current = { type: 'pan' }
      setSelectedId(null)
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    const g = gestureRef.current
    if (!g) return

    if (pointers.current.size >= 2) {
      if (g.type !== 'pinch') gestureRef.current = { type: 'pinch' }
      const pinch = gestureRef.current as Extract<Gesture, { type: 'pinch' }>
      const pts = [...pointers.current.values()].slice(0, 2)
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      if (pinch.prevDist && pinch.prevMid) {
        const factor = dist / pinch.prevDist
        const prevMid = pinch.prevMid
        setView((v) => {
          const s = clampZoom(v.s * factor)
          const k = s / v.s
          const rect = viewportRef.current?.getBoundingClientRect()
          const mx = mid.x - (rect?.left ?? 0)
          const my = mid.y - (rect?.top ?? 0)
          const pmx = prevMid.x - (rect?.left ?? 0)
          const pmy = prevMid.y - (rect?.top ?? 0)
          return {
            s,
            x: mx - (pmx - v.x) * k,
            y: my - (pmy - v.y) * k,
          }
        })
      }
      pinch.prevDist = dist
      pinch.prevMid = mid
      return
    }

    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y

    if (g.type === 'pan') {
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
    } else if (g.type === 'item') {
      g.moved = true
      const s = viewRef.current.s
      setItems((prevItems) =>
        prevItems.map((i) => (i.id === g.id ? { ...i, x: i.x + dx / s, y: i.y + dy / s } : i)),
      )
    } else if (g.type === 'resize') {
      g.moved = true
      const s = viewRef.current.s
      setItems((prevItems) =>
        prevItems.map((i) =>
          i.id === g.id
            ? { ...i, w: Math.min(900, Math.max(140, (i.w || 260) + dx / s)) }
            : i,
        ),
      )
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)

    const g = gestureRef.current
    if (g?.type === 'pinch') {
      if (pointers.current.size === 1) {
        gestureRef.current = { type: 'pan' }
      } else if (pointers.current.size === 0) {
        gestureRef.current = null
      } else {
        g.prevDist = undefined
        g.prevMid = undefined
      }
      return
    }

    if (g && (g.type === 'item' || g.type === 'resize')) {
      if (g.moved) persistItemGeometry(g.id)
      setDraggingId(null)
    }
    gestureRef.current = null
  }

  /* ---------- paste & drop ---------- */

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (dialog) return
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable]')) return
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (files.length) {
        e.preventDefault()
        void createImageItem(files[0], viewCenterWorld())
        return
      }
      const text = e.clipboardData?.getData('text') ?? ''
      const url = extractUrl(text)
      if (url) {
        e.preventDefault()
        setDialog({ mode: 'add', prefillUrl: url, spawn: viewCenterWorld() })
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog, boardId])

  async function createImageItem(file: File, pos: { x: number; y: number }) {
    const fd = new FormData()
    fd.set('board', boardId)
    fd.set('x', String(Math.round(pos.x)))
    fd.set('y', String(Math.round(pos.y)))
    fd.set('w', '260')
    fd.set('image', file)
    try {
      const rec = await pb.collection('items').create<ItemRecord>(fd)
      setItems((prev) => (prev.some((i) => i.id === rec.id) ? prev : [...prev, rec]))
      setSelectedId(rec.id)
    } catch {
      // ignore; realtime or refresh will reconcile
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const v = viewRef.current
    const rect = viewportRef.current?.getBoundingClientRect()
    const pos = {
      x: (e.clientX - (rect?.left ?? 0) - v.x) / v.s - 130,
      y: (e.clientY - (rect?.top ?? 0) - v.y) / v.s - 100,
    }
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
    if (files.length) {
      files.forEach((f, idx) => void createImageItem(f, { x: pos.x + idx * 40, y: pos.y + idx * 40 }))
      return
    }
    const url = extractUrl(e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text'))
    if (url) setDialog({ mode: 'add', prefillUrl: url, spawn: pos })
  }

  /* ---------- keyboard ---------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialog) return
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable]')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        void deleteItem(selectedId)
      }
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, dialog])

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    setSelectedId((sel) => (sel === id ? null : sel))
    try {
      await pb.collection('items').delete(id)
    } catch {
      // realtime/refresh reconciles
    }
  }

  /* ---------- board title ---------- */

  async function commitTitle() {
    if (!board) return
    const name = titleDraft.trim()
    if (!name || name === board.name) {
      setTitleDraft(board.name)
      return
    }
    setBoard({ ...board, name })
    try {
      await pb.collection('boards').update(board.id, { name })
    } catch {
      setBoard(board)
      setTitleDraft(board.name)
    }
  }

  /* ---------- render ---------- */

  if (notFound) {
    return (
      <div className="empty-state" style={{ paddingTop: 120 }}>
        <div className="big">🤷</div>
        <p>This board doesn’t exist (or isn’t yours).</p>
        <button className="btn" style={{ marginTop: 16 }} onClick={() => navigate('/boards')}>
          ← Back to boards
        </button>
      </div>
    )
  }

  const selected = selectedId ? items.find((i) => i.id === selectedId) : undefined

  return (
    <div className="canvas-page">
      <header className="canvas-topbar" data-ui>
        <button className="btn btn-icon btn-ghost" title="All boards" onClick={() => navigate('/boards')}>
          ←
        </button>
        <input
          className="canvas-title"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setTitleDraft(board?.name ?? '')
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          aria-label="Board name"
        />
        <div className="topbar-spacer" />
        <span className="muted">{items.length} item{items.length === 1 ? '' : 's'}</span>
      </header>

      <div
        ref={viewportRef}
        className={'canvas-viewport' + (gestureRef.current?.type === 'pan' ? ' panning' : '')}
        style={{
          top: 49,
          backgroundImage: 'radial-gradient(circle, #d9d7d1 1.1px, transparent 1.1px)',
          backgroundSize: `${GRID * view.s}px ${GRID * view.s}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <div
          className="canvas-world"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
        >
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              dragging={item.id === draggingId}
            />
          ))}
        </div>

        {selected && draggingId === null && (
          <div
            className="selection-bar"
            data-ui
            style={{
              left: selected.x * view.s + view.x + ((selected.w || 260) * view.s) / 2,
              top: selected.y * view.s + view.y - 12,
            }}
          >
            {selected.url && (
              <a
                className="btn btn-icon btn-ghost"
                href={selected.url}
                target="_blank"
                rel="noreferrer noopener"
                title="Open shop page"
              >
                🔗
              </a>
            )}
            <button
              className="btn btn-icon btn-ghost"
              title="Edit"
              onClick={() => setDialog({ mode: 'edit', item: selected })}
            >
              ✏️
            </button>
            <button
              className="btn btn-icon btn-ghost"
              title="Delete"
              onClick={() => void deleteItem(selected.id)}
            >
              🗑️
            </button>
          </div>
        )}

        <div className="zoom-controls" data-ui>
          <button
            title="Zoom out"
            onClick={() => {
              const rect = viewportRef.current?.getBoundingClientRect()
              if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.2)
            }}
          >
            −
          </button>
          <span
            className="zoom-level"
            title="Reset view"
            onClick={() => setView({ x: 0, y: 0, s: 1 })}
          >
            {Math.round(view.s * 100)}%
          </span>
          <button
            title="Zoom in"
            onClick={() => {
              const rect = viewportRef.current?.getBoundingClientRect()
              if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2)
            }}
          >
            +
          </button>
        </div>

        <button
          className="fab"
          data-ui
          title="Add product"
          onClick={() => setDialog({ mode: 'add', spawn: viewCenterWorld() })}
        >
          +
        </button>

        {hint && (
          <div className="canvas-hint">
            ✌️ Two fingers to move & pinch to zoom · tap + to add
          </div>
        )}
      </div>

      {dialog && (
        <ItemDialog
          state={dialog}
          boardId={boardId}
          onClose={() => setDialog(null)}
          onSaved={(item) => {
            setItems((prev) => {
              const exists = prev.some((i) => i.id === item.id)
              return exists ? prev.map((i) => (i.id === item.id ? item : i)) : [...prev, item]
            })
            setSelectedId(item.id)
          }}
        />
      )}
    </div>
  )
}
