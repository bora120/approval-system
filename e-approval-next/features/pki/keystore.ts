/**
 * 인증서 개인키 보관소 (브라우저 IndexedDB)
 *
 * keys     : "인증서 암호"로 암호화(AES-256-GCM)한 개인키 암호문. 평문 개인키는 저장하지 않는다.
 *            같은 암호문이 서버 DB 에도 보관되어, 다른 PC 에서는 서버에서 내려받아 복원한다.
 * sessions : 인증서 인증(잠금 해제) 상태. 인증서 암호로 한 번 풀어서 만든 "추출 불가(non-extractable)" 서명 키.
 *            추출 불가 키는 브라우저가 서명에만 쓰게 해 주고, 키 값 자체는 자바스크립트로도 꺼낼 수 없다.
 *            만료 시각이 지나거나 로그아웃·잠금하면 지운다.
 * 로그인 아이디마다 1개씩 보관한다.
 */
import type { LocalKeyRecord } from './types'

const DB_NAME = 'approval-pki'
const KEYS = 'keys'
const SESSIONS = 'sessions'
const VERSION = 2 // v2: 인증서 인증 세션 저장소 추가

/** 인증서 인증 세션 (잠금 해제된 서명 키) */
export interface SigningSessionRecord {
  loginId: string
  serialNumber: string
  key: CryptoKey // non-extractable, usages: ['sign']
  idleExpiresAt: number // 마지막 사용 후 이 시각까지 유효 (사용할 때마다 연장)
  absoluteExpiresAt: number // 인증한 뒤 이 시각이 지나면 무조건 만료
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(KEYS)) db.createObjectStore(KEYS, { keyPath: 'loginId' })
      if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS, { keyPath: 'loginId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error('IndexedDB 를 열 수 없습니다.'))
    }
  })
  return dbPromise
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = () => reject(tx.error ?? new Error('인증서 저장소 오류'))
        tx.onabort = () => reject(tx.error ?? new Error('인증서 저장소 작업이 취소되었습니다.'))
      }),
  )
}

// ------------------------------------------------------------------ 암호화된 개인키

export async function saveLocalKey(record: LocalKeyRecord): Promise<void> {
  await run(KEYS, 'readwrite', (s) => s.put(record))
}

export async function getLocalKey(loginId: string): Promise<LocalKeyRecord | null> {
  const r = await run<LocalKeyRecord | undefined>(KEYS, 'readonly', (s) => s.get(loginId))
  return r ?? null
}

// ------------------------------------------------------------------ 인증서 인증 세션

export async function saveSigningSession(record: SigningSessionRecord): Promise<void> {
  await run(SESSIONS, 'readwrite', (s) => s.put(record))
}

export async function getSigningSession(loginId: string): Promise<SigningSessionRecord | null> {
  const r = await run<SigningSessionRecord | undefined>(SESSIONS, 'readonly', (s) => s.get(loginId))
  return r ?? null
}

export async function deleteSigningSession(loginId?: string): Promise<void> {
  await run(SESSIONS, 'readwrite', (s) => (loginId ? s.delete(loginId) : s.clear()))
}
