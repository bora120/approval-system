'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import CertPasswordDialog, { type SignAuth } from './components/CertPasswordDialog'
import { loadSignerState, signingSessionInfo, SIGNER_STATE_MESSAGE, type SignerState } from './certificate'
import { isCryptoAvailable } from './crypto'
import type { LocalKeyRecord } from './types'

type ReadySigner = Extract<SignerState, { kind: 'ready' }>

export type { SignAuth }

interface SignRequest {
  title: string
  description: string
  confirmLabel: string
  /**
   * 서명하고 서버에 보내는 작업. auth 는 signDocumentAction 에 그대로 넘기면 된다.
   * 실패하면 throw → 창에 에러를 보여주고 다시 시도받는다
   */
  onSign: (record: LocalKeyRecord, auth: SignAuth) => Promise<void>
  /** 사용자가 창을 닫았을 때 */
  onCancel?: () => void
}

/**
 * 인증서 전자서명 흐름 (상신·승인·반려 공통)
 *   1) prepare(): 이 브라우저에서 서명할 수 있는지 확인 (인증서 + 개인키, 필요하면 서버 백업에서 자동 복원)
 *   2) open(ready, 요청): 서명 창을 띄움 → 인증 전이면 암호 입력, 인증 후면 확인만 → onSign 실행
 * 화면에는 {dialog} 와 {problem} 을 그대로 넣으면 된다.
 */
export function useCertificateSigner(loginId: string | undefined) {
  const [request, setRequest] = useState<(SignRequest & { ready: ReadySigner; sessionUntil: number | null }) | null>(
    null,
  )
  const [problemText, setProblemText] = useState('')

  const prepare = useCallback(async (): Promise<ReadySigner | null> => {
    setProblemText('')
    if (!isCryptoAvailable()) {
      setProblemText('이 브라우저에서는 전자서명을 할 수 없습니다. http://localhost:3000 또는 https 주소로 접속하세요.')
      return null
    }
    if (!loginId) {
      setProblemText('로그인 정보를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.')
      return null
    }
    const state = await loadSignerState(loginId)
    if (state.kind !== 'ready') {
      setProblemText(SIGNER_STATE_MESSAGE[state.kind])
      return null
    }
    return state
  }, [loginId])

  const open = useCallback(async (ready: ReadySigner, req: SignRequest) => {
    const session = await signingSessionInfo(ready.record.loginId, ready.record.serialNumber)
    setRequest({ ...req, ready, sessionUntil: session ? session.idleExpiresAt : null })
  }, [])

  const dialog = request ? (
    <CertPasswordDialog
      title={request.title}
      description={request.description}
      cert={request.ready.cert}
      confirmLabel={request.confirmLabel}
      sessionUntil={request.sessionUntil}
      onSubmit={async (auth) => {
        await request.onSign(request.ready.record, auth)
        setRequest(null)
      }}
      onClose={() => {
        setRequest(null)
        request.onCancel?.()
      }}
    />
  ) : null

  const problem = problemText ? (
    <div className="apv-alert apv-no-print">
      {problemText} <Link href="/certificate">인증서 관리로 이동 →</Link>
    </div>
  ) : null

  return { prepare, open, dialog, problem, clearProblem: () => setProblemText('') }
}
