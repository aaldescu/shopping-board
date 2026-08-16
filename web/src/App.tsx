import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { pb } from './lib/pb'
import LoginPage from './pages/LoginPage'
import BoardsPage from './pages/BoardsPage'
import BoardPage from './pages/BoardPage'
import SharePage from './pages/SharePage'

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  if (!pb.authStore.isValid) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}

export default function App() {
  const [, setAuthVersion] = useState(0)

  useEffect(() => {
    // Re-render on login/logout so route guards react immediately.
    return pb.authStore.onChange(() => setAuthVersion((v) => v + 1))
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/boards"
        element={
          <RequireAuth>
            <BoardsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/b/:boardId"
        element={
          <RequireAuth>
            <BoardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/share"
        element={
          <RequireAuth>
            <SharePage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to={pb.authStore.isValid ? '/boards' : '/login'} replace />} />
    </Routes>
  )
}
