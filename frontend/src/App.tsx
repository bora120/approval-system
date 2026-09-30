import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import AdminApprovalPage from './pages/AdminApprovalPage'
import HomePlaceholder from './pages/HomePlaceholder'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* 로그인한 사용자만 */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomePlaceholder />} />
            {/* 팀원이 만드는 메인/결재 페이지는 여기에 추가 */}
          </Route>

          {/* 관리자만 */}
          <Route element={<ProtectedRoute requireAdmin />}>
            <Route path="/admin/approvals" element={<AdminApprovalPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
