/**
 * 개인키 보관소 (브라우저 IndexedDB)
 *
 * - 개인키는 서버로 절대 보내지 않고 이 브라우저에만 저장한다.
 * - CryptoKey 객체를 그대로 저장한다(추출 불가 키). → 스크립트로도 키 값을 꺼낼 수 없음
 * - 키를 새로 만들어도 예전 키를 지우지 않는다 → 이 브라우저에선 예전 메시지도 계속 읽을 수 있음
 * - (로그인 아이디, 서버 키 번호) 조합으로 저장한다.
 */

const DB_NAME = "approval-messenger";
const STORE = "keys";
const VERSION = 1;

export interface LocalKeyRecord {
  loginId: string;
  keyId: number;
  encPrivateKey: CryptoKey;
  encPublicKey: CryptoKey; // 보낸 메시지를 나도 읽을 수 있게 AES 키를 내 공개키로도 감쌀 때 사용
  sigPrivateKey: CryptoKey;
  createdAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: ["loginId", "keyId"] });
        store.createIndex("byLogin", "loginId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("IndexedDB 를 열 수 없습니다."));
    };
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? new Error("키 저장소 오류"));
        tx.onabort = () => reject(tx.error ?? new Error("키 저장소 작업이 취소되었습니다."));
      }),
  );
}

export async function saveLocalKeys(record: LocalKeyRecord): Promise<void> {
  await run("readwrite", (s) => s.put(record));
}

export async function getLocalKeys(loginId: string, keyId: number): Promise<LocalKeyRecord | null> {
  const r = await run<LocalKeyRecord | undefined>("readonly", (s) => s.get([loginId, keyId]));
  return r ?? null;
}

export async function listLocalKeys(loginId: string): Promise<LocalKeyRecord[]> {
  return run<LocalKeyRecord[]>("readonly", (s) => s.index("byLogin").getAll(loginId));
}
