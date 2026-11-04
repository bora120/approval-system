/**
 * 인증서 개인키 보관소 (브라우저 IndexedDB)
 *
 * - 개인키는 서버로 절대 보내지 않는다.
 * - 평문으로 저장하지 않고 "인증서 암호"로 암호화(AES-256-GCM)한 값만 저장한다.
 *   → 공동인증서의 signPri.key 파일이 인증서 암호로 암호화되어 있는 것과 같은 방식
 * - 로그인 아이디마다 최신 키 1개만 보관한다.
 */
import type { LocalKeyRecord } from './types'

const DB_NAME = 'approval-pki'
const STORE = 'keys'
const VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'loginId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error('IndexedDB 를 열 수 없습니다.'))
    }
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = () => reject(tx.error ?? new Error('인증서 저장소 오류'))
        tx.onabort = () => reject(tx.error ?? new Error('인증서 저장소 작업이 취소되었습니다.'))
      }),
  )
}

export async function saveLocalKey(record: LocalKeyRecord): Promise<void> {
  await run('readwrite', (s) => s.put(record))
}

export async function getLocalKey(loginId: string): Promise<LocalKeyRecord | null> {
  const r = await run<LocalKeyRecord | undefined>('readonly', (s) => s.get(loginId))
  return r ?? null
}
