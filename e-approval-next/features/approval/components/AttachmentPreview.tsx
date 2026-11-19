'use client'

import { useEffect, useState } from 'react'
import { documentApi } from '../api'
import type { AttachmentInfo } from '../types'
import { formatBytes } from '../utils'

/**
 * 첨부파일 미리보기 — 결재하면서 바로 옆에서 파일을 확인한다.
 *  - PDF · 이미지 : 그대로 보여줌
 *  - 텍스트(txt, csv, json, md, log) : 글자로 보여줌
 *  - 그 밖의 형식(hwp, docx, xlsx 등) : 내려받기 안내
 * 내려받은 파일의 SHA-256 을 다시 계산해서, 상신할 때 전자서명에 들어간 해시와 같은지(위·변조 여부)도 표시한다.
 *
 * 보안: 파일은 우리가 정한 형식(MIME)으로만 화면에 띄운다. HTML·SVG 처럼 스크립트가 들어갈 수 있는 형식은 미리보지 않는다.
 */

type Kind = 'pdf' | 'image' | 'text' | 'none'

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
}
const TEXT_EXT = ['txt', 'csv', 'json', 'md', 'log']
const MAX_PREVIEW_BYTES = 25 * 1024 * 1024 // 결재 첨부 최대 크기보다 넉넉하게
const MAX_TEXT_CHARS = 200_000

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}

export function previewKind(name: string): Kind {
  const ext = extOf(name)
  if (ext === 'pdf') return 'pdf'
  if (IMAGE_TYPES[ext]) return 'image'
  if (TEXT_EXT.includes(ext)) return 'text'
  return 'none'
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

interface Loaded {
  url: string | null // pdf·이미지용 blob 주소
  text: string | null
  hashOk: boolean | null // null = 확인 불가(https 아님)
}

interface Props {
  docId: number
  attachments: AttachmentInfo[]
}

export default function AttachmentPreview({ docId, attachments }: Props) {
  const previewable = attachments.filter((a) => previewKind(a.originalName) !== 'none')
  const [selectedId, setSelectedId] = useState<number | null>(previewable[0]?.id ?? attachments[0]?.id ?? null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const selected = attachments.find((a) => a.id === selectedId) ?? null
  const kind = selected ? previewKind(selected.originalName) : 'none'

  useEffect(() => {
    setLoaded(null)
    setError('')
    if (!selected) return
    if (kind === 'none') return
    if (selected.size > MAX_PREVIEW_BYTES) {
      setError('파일이 커서 미리보기 대신 내려받아 확인하세요.')
      return
    }

    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch(documentApi.attachmentUrl(docId, selected.id), { credentials: 'include' })
        if (!res.ok) throw new Error(res.status === 403 ? '이 파일을 볼 권한이 없습니다.' : '파일을 불러오지 못했습니다.')
        const buf = await res.arrayBuffer()
        const hashOk = crypto?.subtle ? (await sha256Hex(buf)) === selected.sha256.toLowerCase() : null
        if (cancelled) return

        if (kind === 'text') {
          const text = new TextDecoder('utf-8').decode(buf)
          setLoaded({
            url: null,
            text: text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) + '\n…(이하 생략)' : text,
            hashOk,
          })
        } else {
          const type = kind === 'pdf' ? 'application/pdf' : IMAGE_TYPES[extOf(selected.originalName)]
          objectUrl = URL.createObjectURL(new Blob([buf], { type }))
          setLoaded({ url: objectUrl, text: null, hashOk })
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '파일을 불러오지 못했습니다.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      // 화면이 다음 파일로 바뀐 뒤에 해제 (바로 해제하면 이전 미리보기가 잠깐 깨짐)
      if (objectUrl) {
        const url = objectUrl
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    }
    // selected 객체가 아니라 id 로 다시 불러온다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, selectedId, kind])

  if (attachments.length === 0) return null

  return (
    <aside className="apv-preview apv-no-print" aria-label="첨부파일 미리보기">
      <div className="apv-preview-head">
        <h3>첨부파일 미리보기</h3>
        <span className="apv-muted">{attachments.length}개</span>
      </div>

      <div className="apv-preview-tabs" role="tablist" aria-label="첨부파일 선택">
        {attachments.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={a.id === selectedId}
            className={a.id === selectedId ? 'is-active' : ''}
            onClick={() => setSelectedId(a.id)}
            title={a.originalName}
          >
            <span className="apv-preview-ext">{extOf(a.originalName).toUpperCase() || 'FILE'}</span>
            <span className="apv-preview-name">{a.originalName}</span>
          </button>
        ))}
      </div>

      {selected && (
        <>
          <div className="apv-preview-meta">
            <span>{formatBytes(selected.size)}</span>
            {loaded?.hashOk === true && <span className="apv-preview-hash">✔ 서명된 원본과 동일 (SHA-256)</span>}
            {loaded?.hashOk === false && (
              <span className="apv-preview-hash is-fail">✖ 서명된 원본과 다름 — 파일이 바뀌었습니다</span>
            )}
            <a className="apv-btn apv-btn--sm apv-btn--ghost" href={documentApi.attachmentUrl(docId, selected.id)} download>
              내려받기
            </a>
          </div>

          <div className={`apv-preview-body apv-preview-body--${kind}`}>
            {kind === 'none' && (
              <p className="apv-preview-empty">
                이 형식({extOf(selected.originalName).toUpperCase() || '알 수 없음'})은 미리보기를 지원하지 않습니다.
                <br />
                내려받아서 확인하세요. (미리보기: PDF · 이미지 · 텍스트)
              </p>
            )}
            {kind !== 'none' && loading && <p className="apv-preview-empty">불러오는 중...</p>}
            {kind !== 'none' && error && <p className="apv-preview-empty">{error}</p>}
            {loaded?.url && kind === 'pdf' && (
              <iframe src={loaded.url} title={`${selected.originalName} 미리보기`} />
            )}
            {loaded?.url && kind === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={loaded.url} alt={selected.originalName} />
            )}
            {loaded?.text != null && <pre>{loaded.text}</pre>}
          </div>
        </>
      )}
    </aside>
  )
}
