import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { AttachmentInfo } from '../types'
import { ALLOWED_EXTENSIONS, MAX_FILE_COUNT, MAX_FILE_SIZE_MB } from '../types'
import { fileExtension, formatBytes } from '../utils'

interface Props {
  existing: AttachmentInfo[]        // 이미 서버에 저장된 파일 (수정 모드)
  removedIds: number[]              // 삭제 표시한 기존 파일
  newFiles: File[]                  // 새로 추가할 파일
  onRemoveExisting: (id: number) => void
  onRestoreExisting: (id: number) => void
  onNewFilesChange: (files: File[]) => void
}

export default function AttachmentInput({
  existing,
  removedIds,
  newFiles,
  onRemoveExisting,
  onRestoreExisting,
  onNewFilesChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  const keptCount = existing.filter((a) => !removedIds.includes(a.id)).length
  const totalCount = keptCount + newFiles.length

  const addFiles = (list: FileList | null) => {
    if (!list) return
    setError('')
    const accepted: File[] = []
    const problems: string[] = []

    for (const file of Array.from(list)) {
      if (totalCount + accepted.length >= MAX_FILE_COUNT) {
        problems.push(`최대 ${MAX_FILE_COUNT}개까지 첨부할 수 있습니다.`)
        break
      }
      if (!ALLOWED_EXTENSIONS.includes(fileExtension(file.name))) {
        problems.push(`${file.name}: 첨부할 수 없는 형식입니다.`)
        continue
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        problems.push(`${file.name}: ${MAX_FILE_SIZE_MB}MB를 넘습니다.`)
        continue
      }
      if (file.size === 0) {
        problems.push(`${file.name}: 빈 파일입니다.`)
        continue
      }
      if (newFiles.some((f) => f.name === file.name && f.size === file.size)) continue
      accepted.push(file)
    }

    if (accepted.length) onNewFilesChange([...newFiles, ...accepted])
    if (problems.length) setError(problems.join(' '))
    if (inputRef.current) inputRef.current.value = '' // 같은 파일 다시 선택 가능하게
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  return (
    <div className="apv-attach">
      <div
        className={`apv-dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      >
        
        <span>
          파일을 끌어다 놓거나 <u>클릭해서 선택</u>하세요
        </span>
        <small>
          최대 {MAX_FILE_COUNT}개 · 파일당 {MAX_FILE_SIZE_MB}MB · {ALLOWED_EXTENSIONS.join(', ')}
        </small>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',')}
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {error && <p className="apv-field-error">{error}</p>}

      {(existing.length > 0 || newFiles.length > 0) && (
        <ul className="apv-file-list">
          {existing.map((a) => {
            const removed = removedIds.includes(a.id)
            return (
              <li key={`e-${a.id}`} className={removed ? 'is-removed' : ''}>
                <span className="apv-file-name">{a.originalName}</span>
                <span className="apv-file-size">{formatBytes(a.size)}</span>
                {removed ? (
                  <button type="button" className="apv-link-btn" onClick={() => onRestoreExisting(a.id)}>
                    되돌리기
                  </button>
                ) : (
                  <button type="button" className="apv-link-btn apv-danger-text" onClick={() => onRemoveExisting(a.id)}>
                    삭제
                  </button>
                )}
              </li>
            )
          })}
          {newFiles.map((f, i) => (
            <li key={`n-${i}-${f.name}`}>
              <span className="apv-file-name">
                <em className="apv-new-tag">새 파일</em> {f.name}
              </span>
              <span className="apv-file-size">{formatBytes(f.size)}</span>
              <button
                type="button"
                className="apv-link-btn apv-danger-text"
                onClick={() => onNewFilesChange(newFiles.filter((_, idx) => idx !== i))}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
