import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pb } from '../lib/pb'

/**
 * The ☰ menu in the top bar: account, the Chrome extension download and
 * sign out. /extension and /_/ are served by PocketBase, not the SPA, so
 * they are plain links (full page loads).
 */
export default function AppMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function logout() {
    pb.authStore.clear()
    navigate('/login')
  }

  return (
    <div className="app-menu" ref={ref}>
      <button
        className="btn btn-icon btn-ghost"
        title="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ☰
      </button>
      {open && (
        <div className="app-menu-list" role="menu">
          <div className="app-menu-account muted">{pb.authStore.record?.email as string}</div>
          <button role="menuitem" onClick={() => navigate('/boards')}>
            🗂️ All boards
          </button>
          <a role="menuitem" href="/extension">
            🧩 Chrome extension
          </a>
          <a role="menuitem" href="/_/" target="_blank" rel="noreferrer">
            ⚙️ Admin dashboard
          </a>
          <div className="app-menu-sep" />
          <button role="menuitem" onClick={logout}>
            ↪ Sign out
          </button>
        </div>
      )}
    </div>
  )
}
