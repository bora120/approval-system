import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { DEPARTMENTS, POSITIONS } from '../api/types'
import type { SignupForm } from '../api/types'

const initialForm: SignupForm = {
  loginId: '',
  password: '',
  name: '',
  department: '',
  position: 'STAFF',
}

export default function SignupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<SignupForm>(initialForm)
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const selectedPosition = POSITIONS.find((p) => p.value === form.position)

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    // 프론트 검증은 사용자 편의용. 최종 검증은 서버(@Valid)에서 다시 함
    if (form.password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }

    setSubmitting(true)
    try {
      const res = await authApi.signup({ ...form, loginId: form.loginId.trim() })
      navigate('/login', { replace: true, state: { notice: res.message } })
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>회원가입</h1>
        <p className="auth-sub">직책에 따라 관리자 승인이 필요할 수 있습니다</p>

        {error && <div className="alert error">{error}</div>}

        <label>
          아이디
          <input
            name="loginId"
            value={form.loginId}
            onChange={onChange}
            placeholder="영문/숫자/_ 4~20자"
            pattern="[a-zA-Z0-9_]{4,20}"
            autoComplete="username"
            required
          />
        </label>

        <label>
          비밀번호
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={onChange}
            placeholder="8자 이상"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </label>

        <label>
          비밀번호 확인
          <input
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        <label>
          이름
          <input name="name" value={form.name} onChange={onChange} required />
        </label>

        <div className="row">
          <label>
            부서
            <select name="department" value={form.department} onChange={onChange} required>
              <option value="">선택</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <label>
            직책
            <select name="position" value={form.position} onChange={onChange} required>
              {POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedPosition?.needsApproval && (
          <div className="alert warn">
            {selectedPosition.label} 직책은 관리자 승인 후 로그인할 수 있습니다.
          </div>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? '가입 중...' : '가입하기'}
        </button>

        <p className="auth-footer">
          이미 계정이 있나요? <Link to="/login">로그인</Link>
        </p>
      </form>
    </div>
  )
}
