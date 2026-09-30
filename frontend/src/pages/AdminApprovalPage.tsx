import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../api/auth'
import type { User } from '../api/types'

/** 관리자: 팀장 이상 가입 요청 승인/거절 */
export default function AdminApprovalPage() {
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState('')

  const load = () => {
    adminApi
      .pendingUsers()
      .then(setUsers)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(load, [])

  const handle = async (id: number, action: 'approve' | 'reject') => {
    setError('')
    try {
      await (action === 'approve' ? adminApi.approve(id) : adminApi.reject(id))
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리에 실패했습니다.')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>가입 승인 관리</h2>
        <Link to="/">← 메인으로</Link>
      </div>

      {error && <div className="alert error">{error}</div>}

      {users.length === 0 ? (
        <p className="empty">승인 대기 중인 사용자가 없습니다.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>아이디</th>
              <th>이름</th>
              <th>부서</th>
              <th>직책</th>
              <th>신청일</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.loginId}</td>
                <td>{u.name}</td>
                <td>{u.department}</td>
                <td>{u.positionLabel}</td>
                <td>{new Date(u.createdAt).toLocaleDateString('ko-KR')}</td>
                <td className="actions">
                  <button onClick={() => handle(u.id, 'approve')}>승인</button>
                  <button className="danger" onClick={() => handle(u.id, 'reject')}>
                    거절
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
