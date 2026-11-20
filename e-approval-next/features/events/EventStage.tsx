'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { startChristmasTree, treeAspect } from './christmasTree'
import { useSiteEvent } from './useSiteEvent'

/**
 * 메인 페이지 기념일 효과.
 * 헤더의 "효과 켜기"가 켜져 있으면 배경 이미지 + 움직이는 효과(모자이크 트리·눈 결정)를 깔고,
 * 꺼져 있거나 이벤트 기간이 아니면 children 만 그대로 보여준다.
 * (사이트 전체 밤하늘 색은 html.theme-night 가 담당 → events.css)
 * 움직임 줄이기 설정이면 멈춘 그림으로 보여준다.
 */
export default function EventStage({ children }: { children: ReactNode }) {
  const { event, on } = useSiteEvent()
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!on || !event || event.effect !== 'christmas-tree') return
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    // 트리 자리: 화면 가운데, 인사말과 제목 사이 공간을 꽉 채우는 크기 (가로로도 화면 안에 다 들어오게)
    const aspect = treeAspect()
    return startChristmasTree(canvas, () => {
      const hero = stage.querySelector<HTMLElement>('.home-hero')
      const title = hero?.querySelector<HTMLElement>('.brand-title')
      if (!hero || !title) return null
      const s = stage.getBoundingClientRect()
      const h = hero.getBoundingClientRect()
      const narrow = s.width < 760
      const bottom = title.getBoundingClientRect().top - s.top - (narrow ? 6 : 12)
      const top = h.top - s.top + (narrow ? 64 : 72) // 인사말 아래부터
      const height = Math.min(narrow ? 340 : 580, bottom - top, (s.width - 32) / aspect)
      if (height < 150) return null
      return { x: s.width / 2, bottom, height }
    })
  }, [on, event])

  const active = on && event

  return (
    <div
      ref={stageRef}
      className={active ? `event-stage is-on event-${event.id}` : 'event-stage'}
      style={active ? ({ '--event-bg': `url("${event.background}")` } as React.CSSProperties) : undefined}
    >
      {active && (
        <>
          <div className="event-backdrop" aria-hidden="true" />
          <canvas ref={canvasRef} className="event-canvas" aria-hidden="true" />
          <p className="event-greeting">{event.greeting}</p>
        </>
      )}
      <div className="event-content">{children}</div>
    </div>
  )
}
