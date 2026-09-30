import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

/**
 * 임시 메인 페이지. 메인 페이지 담당 팀원이 이 파일을 교체하면 됨.
 * 로그인 정보는 useAuth()로 가져온다: user.name, user.positionLabel, user.role ...
 */
export default function HomePlaceholder() {
  const { user, logout } = useAuth()
  if (!user) return null

  return (
    <div className="page">
      <div className="page-header">
        <h2>메인 (임시)</h2>
        <button onClick={logout}>로그아웃</button>
      </div>
      <p>
        {user.department} · {user.positionLabel} <strong>{user.name}</strong>님, 환영합니다.
      </p>
      {user.role === 'ADMIN' && (
        <p>
          <Link to="/admin/approvals">가입 승인 관리 →</Link>
        </p>
      )}
    </div>
  )
}
