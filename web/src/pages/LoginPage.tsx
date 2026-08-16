import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { pb } from '../lib/pb'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  const from = (location.state as { from?: { pathname: string; search: string } } | null)?.from

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'register') {
        await pb.collection('users').create({
          email,
          password,
          passwordConfirm: password,
        })
      }
      await pb.collection('users').authWithPassword(email, password)
      navigate(from ? from.pathname + (from.search || '') : '/boards', { replace: true })
    } catch (err) {
      const msg =
        err instanceof Error && 'response' in err
          ? extractPbError((err as { response?: unknown }).response)
          : ''
      setError(
        msg ||
          (mode === 'login'
            ? 'Sign in failed. Check your email and password.'
            : 'Sign up failed. Try a different email or a longer password (min 8 characters).'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/icon.svg" alt="" />
          Shopping Board
        </div>
        <p className="auth-sub">
          {mode === 'login'
            ? 'Welcome back! Sign in to your boards.'
            : 'Create an account to start collecting.'}
        </p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
        <p className="auth-switch">
          {mode === 'login' ? (
            <>
              No account yet?{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  setMode('register')
                  setError('')
                }}
              >
                Sign up
              </a>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  setMode('login')
                  setError('')
                }}
              >
                Sign in
              </a>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

function extractPbError(response: unknown): string {
  if (!response || typeof response !== 'object') return ''
  const data = (response as { data?: Record<string, { message?: string }> }).data
  if (!data) return ''
  const first = Object.values(data)[0]
  return first?.message || ''
}
