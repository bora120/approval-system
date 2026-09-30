// 모든 API 호출의 공통 함수. 에러 시 서버가 보낸 message를 담아 throw
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include', // 세션 쿠키(JSESSIONID) 포함
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })

  if (!res.ok) {
    let message = '요청에 실패했습니다.'
    try {
      const body = await res.json()
      if (body?.message) message = body.message
    } catch {
      if (res.status === 401) message = '로그인이 필요합니다.'
      if (res.status === 403) message = '권한이 없습니다.'
    }
    throw new ApiError(res.status, message)
  }

  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}
