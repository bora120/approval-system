import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { authApi } from '../api/auth'
import type { User } from '../api/types'

interface AuthContextValue {
  user: User | null        // 로그인한 사용자 (없으면 null)
  loading: boolean         // 첫 로딩(세션 확인) 중인지
  login: (loginId: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // 새로고침해도 로그인 유지: 세션이 살아있으면 /me 로 사용자 정보 복구
  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (loginId: string, password: string) => {
    const u = await authApi.login(loginId, password)
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {})
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  )
}

/** 다른 페이지(메인 등)에서 로그인 정보를 쓸 때: const { user, logout } = useAuth() */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
