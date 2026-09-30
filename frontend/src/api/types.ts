// 백엔드 Position enum과 값을 맞춰야 함
export const POSITIONS = [
  { value: 'STAFF', label: '사원', needsApproval: false },
  { value: 'TEAM_LEADER', label: '팀장', needsApproval: true },
  { value: 'DIRECTOR', label: '본부장', needsApproval: true },
  { value: 'CEO', label: '대표', needsApproval: true },
] as const

export type Position = (typeof POSITIONS)[number]['value']

export const DEPARTMENTS = ['개발팀', '영업팀', '경영지원팀', '인사팀', '회계팀']

export interface User {
  id: number
  loginId: string
  name: string
  department: string
  position: Position | null
  positionLabel: string
  role: 'USER' | 'ADMIN'
  status: 'PENDING' | 'ACTIVE' | 'REJECTED'
  createdAt: string
}

export interface SignupForm {
  loginId: string
  password: string
  name: string
  department: string
  position: Position
}
