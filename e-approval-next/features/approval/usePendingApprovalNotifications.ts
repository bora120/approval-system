'use client'

import { useCallback, useEffect, useState } from 'react'
import { documentApi } from './api'

const POLL_INTERVAL_MS = 15_000

/**
 * 결재 대기함을 15초마다 확인한다.
 * 새 결재 건이 늘어나면 브라우저 알림 권한이 허용된 경우 OS 알림을 띄운다.
 * 탭이 열려 있는 동안 동작하는 폴링 방식이며, 브라우저를 완전히 종료한 상태의 푸시는 아니다.
 */
export function usePendingApprovalNotifications(enabled: boolean) {
  const [count, setCount] = useState(0)
  const [canRequestPermission, setCanRequestPermission] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setCount(0)
      return
    }

    let active = true
    let previousCount: number | null = null

    const load = async () => {
      try {
        const inbox = await documentApi.inbox()
        if (!active) return
        const nextCount = inbox.length
        if (previousCount !== null && nextCount > previousCount) {
          const added = nextCount - previousCount
          if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification('새 결재 문서가 도착했습니다.', {
              body: `새 결재 ${added}건이 도착했습니다. 현재 결재 대기 ${nextCount}건`,
              tag: 'approval-inbox-update',
            })
            notification.onclick = () => {
              window.focus()
              window.location.href = '/documents?tab=INBOX'
              notification.close()
            }
          }
        }
        previousCount = nextCount
        setCount(nextCount)
      } catch {
        // 일시적인 서버 연결 오류는 다음 polling에서 다시 확인한다.
      }
    }

    const refresh = () => { void load() }
    refresh()
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS)
    window.addEventListener('focus', refresh)
    window.addEventListener('approval-inbox-updated', refresh)
    document.addEventListener('visibilitychange', refresh)

    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('approval-inbox-updated', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [enabled])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setCanRequestPermission(Notification.permission === 'default')
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false
    const permission = await Notification.requestPermission()
    setCanRequestPermission(permission === 'default')
    return permission === 'granted'
  }, [])

  return { count, canRequestPermission, requestPermission }
}
