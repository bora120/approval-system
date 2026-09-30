import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // 회원가입 후 넘어왔을 때 보여줄 안내 메시지
  const notice = (location.state as { notice?: string } | null)?.notice

  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(loginId.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>전자결재 시스템</h1>
        <p className="auth-sub">사내 계정으로 로그인하세요</p>

        {notice && <div className="alert info">{notice}</div>}
        {error && <div className="alert error">{error}</div>}

        <label>
          아이디
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <button type="submit" disabled={submitting}>
          {submitting ? '로그인 중...' : '로그인'}
        </button>

        <p className="auth-footer">
          계정이 없나요? <Link to="/signup">회원가입</Link>
        </p>
      </form>
    </div>
  )
}
