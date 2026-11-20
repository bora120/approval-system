'use client'

import { useCallback, useEffect, useState } from 'react'
import { activeEvent, EVENT_CHANGE, isTurnedOff, setEventOn, type SiteEvent } from './events'

/**
 * 지금 진행 중인 이벤트와 켜짐 여부. 헤더 버튼·메인 페이지 효과가 함께 쓴다.
 * event 가 null 이면 이벤트 기간이 아님 (버튼도 숨김).
 */
export function useSiteEvent() {
  const [event, setEvent] = useState<SiteEvent | null>(null)
  const [on, setOn] = useState(false)

  useEffect(() => {
    const e = activeEvent(new Date(), window.location.search)
    setEvent(e)
    const sync = () => {
      const next = !!e && !isTurnedOff(e)
      // 다른 탭에서 바꾼 경우에도 이 탭의 테마를 맞춘다
      if (e) {
        document.documentElement.classList.toggle('theme-night', next)
        document.documentElement.classList.toggle(`event-${e.id}`, next)
      }
      setOn(next)
    }
    sync()
    window.addEventListener(EVENT_CHANGE, sync)
    window.addEventListener('storage', sync) // 다른 탭에서 바꿨을 때
    return () => {
      window.removeEventListener(EVENT_CHANGE, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const toggle = useCallback(() => {
    if (event) setEventOn(event, !on)
  }, [event, on])

  return { event, on, toggle }
}
