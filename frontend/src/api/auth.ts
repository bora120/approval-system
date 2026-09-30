import { api } from './client'
import type { SignupForm, User } from './types'

export const authApi = {
  login: (loginId: string, password: string) =>
    api<User>('/api/auth/login', { method: 'POST', body: JSON.stringify({ loginId, password }) }),

  signup: (form: SignupForm) =>
    api<{ message: string; user: User }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(form),
    }),

  me: () => api<User>('/api/auth/me'),

  logout: () => api<void>('/api/auth/logout', { method: 'POST' }),
}

export const adminApi = {
  pendingUsers: () => api<User[]>('/api/admin/users?status=PENDING'),
  approve: (id: number) => api<User>(`/api/admin/users/${id}/approve`, { method: 'PATCH' }),
  reject: (id: number) => api<User>(`/api/admin/users/${id}/reject`, { method: 'PATCH' }),
}
