'use client'

import { useCallback, useEffect, useState } from 'react'
import { SESSION_CHANGE_EVENT, signingSessionInfo, type SigningSessionInfo } from './certificate'

/**
 * 인증서 인증(한 번 인증) 상태를 화면에 보여주기 위한 훅.
 * 인증·잠금·서명 때 바뀌고, 만료 시각이 지나면 30초 안에 "잠김"으로 바뀐다.
 */
export function useSigningSession(loginId: string | undefined, serialNumber?: string) {
  const [session, setSession] = useState<SigningSessionInfo | null>(null)

  const refresh = useCallback(async () => {
    if (!loginId || typeof indexedDB === 'undefined') {
      setSession(null)
      return
    }
    setSession(await signingSessionInfo(loginId, serialNumber))
  }, [loginId, serialNumber])

  useEffect(() => {
    void refresh()
    const onChange = () => void refresh()
    const timer = window.setInterval(onChange, 30_000)
    window.addEventListener(SESSION_CHANGE_EVENT, onChange)
    window.addEventListener('focus', onChange)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener(SESSION_CHANGE_EVENT, onChange)
      window.removeEventListener('focus', onChange)
    }
  }, [refresh])

  return { session, active: session !== null, refresh }
}

/** "14:30까지" 같은 짧은 시각 표시 */
export function formatUntil(ms: number): string {
  return new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}
