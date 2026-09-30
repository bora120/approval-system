import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

/**
 * 로그인해야 들어갈 수 있는 페이지를 감싸는 컴포넌트.
 * requireAdmin: 관리자만 접근 가능
 * ※ 화면 숨김일 뿐이고, 실제 권한 검사는 반드시 서버(SecurityConfig)에서 한다.
 */
export default function ProtectedRoute({ requireAdmin = false }: { requireAdmin?: boolean }) {
  const { user, loading } = useAuth()

  if (loading) return <div className="center-message">불러오는 중...</div>
  if (!user) return <Navigate to="/login" replace />
  if (requireAdmin && user.role !== 'ADMIN') return <Navigate to="/" replace />

  return <Outlet />
}
