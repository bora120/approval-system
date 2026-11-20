/**
 * 기념일 이벤트 설정 (크리스마스 등)
 *
 * 이벤트 기간에 "효과"를 켜면
 *  - 사이트 전체가 밤하늘 테마(다크)로 바뀌고 (html.theme-night → features/events/events.css 의 색 변수)
 *  - 메인 페이지에는 배경 이미지 + 움직이는 효과(모자이크 트리·눈 결정)가 나온다.
 * 켜기/끄기는 헤더 버튼으로, 이 브라우저에 기억된다. (기본값: 켜짐)
 *
 * 새 이벤트를 넣으려면 EVENTS 에 한 줄 추가하고, 배경 이미지를 public/events/<id>/ 에 넣으면 된다.
 *  - start / end : "MM-DD" (해마다 반복). 12-30 ~ 01-02 처럼 해를 넘겨도 된다.
 *  - background  : 메인 페이지 배경 이미지. 파일이 없으면 밤하늘 색만 보인다.
 *
 * 미리보기: 주소 뒤에 ?event=christmas 를 붙이면 기간이 아니어도 보인다. ?event=off 는 끄기.
 */
export type EventEffect = 'christmas-tree'

export interface SiteEvent {
  id: string
  name: string
  start: string // MM-DD
  end: string // MM-DD
  background: string
  effect: EventEffect
  greeting: string
}

export const EVENTS: SiteEvent[] = [
  {
    id: 'christmas',
    name: '크리스마스',
    start: '11-20', // 크리스마스 시즌 시작 (원하면 12-01 등으로 바꾸기)
    end: '12-26',
    background: '/events/christmas/background.jpg',
    effect: 'christmas-tree',
    greeting: 'Merry Christmas — 따뜻한 연말 보내세요',
  },
]

/** 켜기/끄기가 바뀌면 window 에 보내는 이벤트 */
export const EVENT_CHANGE = 'nano-event-change'
const THEME_CLASS = 'theme-night'

function mmdd(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function inRange(today: string, start: string, end: string): boolean {
  return start <= end ? today >= start && today <= end : today >= start || today <= end
}

/** 오늘(또는 ?event= 로 지정한) 이벤트. 없으면 null */
export function activeEvent(now: Date = new Date(), search = ''): SiteEvent | null {
  const forced = new URLSearchParams(search).get('event')
  if (forced === 'off') return null
  if (forced) return EVENTS.find((e) => e.id === forced) ?? null
  const today = mmdd(now)
  return EVENTS.find((e) => inRange(today, e.start, e.end)) ?? null
}

/** "효과 끄기"를 누른 기록 (이벤트·연도별, 이 브라우저에만) */
export function offKey(event: SiteEvent, now: Date = new Date()): string {
  return `nano-event-off:${event.id}:${now.getFullYear()}`
}

export function isTurnedOff(event: SiteEvent): boolean {
  try {
    return window.localStorage.getItem(offKey(event)) === '1'
  } catch {
    return false
  }
}

/** 켜기/끄기 + 사이트 테마 반영 + 다른 컴포넌트에 알림 */
export function setEventOn(event: SiteEvent, on: boolean) {
  try {
    if (on) window.localStorage.removeItem(offKey(event))
    else window.localStorage.setItem(offKey(event), '1')
  } catch {
    // 저장 못 해도 이번 화면에는 적용
  }
  const root = document.documentElement
  root.classList.toggle(THEME_CLASS, on)
  root.classList.toggle(`event-${event.id}`, on)
  window.dispatchEvent(new CustomEvent(EVENT_CHANGE))
}

/**
 * 화면이 그려지기 전에 <head> 에서 실행할 스크립트 (흰 화면이 번쩍이지 않게).
 * activeEvent / offKey 와 같은 규칙을 EVENTS 를 넣어서 그대로 계산한다.
 */
export function themeBootScript(): string {
  const events = JSON.stringify(EVENTS.map(({ id, start, end }) => ({ id, start, end })))
  return `(function(){try{
var E=${events},d=new Date(),q=new URLSearchParams(location.search).get('event');
if(q==='off')return;
var t=('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2),e=null;
for(var i=0;i<E.length;i++){var x=E[i];
if(q?x.id===q:(x.start<=x.end?(t>=x.start&&t<=x.end):(t>=x.start||t<=x.end))){e=x;break;}}
if(!e)return;
try{if(localStorage.getItem('nano-event-off:'+e.id+':'+d.getFullYear())==='1')return;}catch(_){}
document.documentElement.classList.add('${THEME_CLASS}','event-'+e.id);
}catch(_){}})();`
}
