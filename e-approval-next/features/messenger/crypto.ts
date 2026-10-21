/**
 * 메신저 종단간(E2E) 암호화 핵심 모듈 — 브라우저 Web Crypto API 사용
 * (원본: secure-messenger/public/crypto.js 를 TypeScript 로 옮기고 기능을 확장)
 *
 * 키 구성 (사용자당 RSA 키쌍 2개)
 *   - 암호화용  RSA-OAEP 2048 / SHA-256  : AES 키를 감싸서 기밀성 보장
 *   - 서명용    RSA-PSS  2048 / SHA-256  : 무결성 + 보낸 사람 인증 + 부인방지
 *   - 개인키는 "추출 불가(non-extractable)"로 만들어 IndexedDB 에만 보관
 *     → 화면에 악성 스크립트가 들어와도 개인키 값을 꺼내 갈 수 없음
 *
 * 메시지 1건 암호화 (하이브리드)
 *   1) 1회용 AES-256-GCM 키 생성
 *   2) 본문(JSON: 텍스트 + 첨부파일 정보)과 첨부파일을 각각 다른 IV 로 AES-GCM 암호화
 *   3) AES 키를 받는 사람 공개키로 한 번, 내 공개키로 한 번 암호화
 *      (내 것도 만드는 이유: 보낸 메시지를 나중에 내 화면에서도 다시 읽기 위해)
 *   4) "v1|보낸사람ID|받는사람ID|본문" 에 RSA-PSS 서명
 *      → 다른 사람에게 재전송하거나 보낸 사람을 바꿔치기하면 검증 실패
 *   5) 본문 안의 id(UUID) 를 서버가 중복 불가로 저장 → 같은 메시지 재전송(replay) 차단
 */
import type { EncryptedMessage, FileMeta, MessagePayload } from "./types";

const te = new TextEncoder();
const td = new TextDecoder();

const RSA_OAEP = { name: "RSA-OAEP", hash: "SHA-256" } as const;
const RSA_PSS = { name: "RSA-PSS", hash: "SHA-256" } as const;
const PSS_PARAMS = { name: "RSA-PSS", saltLength: 32 } as const;

// ------------------------------------------------------------------ 기본 도구

/** 브라우저가 암호화 기능을 쓸 수 있는지 (https 또는 localhost 에서만 가능) */
export function isCryptoAvailable(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && !!window.crypto?.subtle;
}

export function bytesToB64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let bin = "";
  const CHUNK = 0x8000; // 큰 배열에서도 스택이 넘치지 않도록 나눠서 변환
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ------------------------------------------------------------------ 키 생성 / 변환

export interface GeneratedKeySet {
  encKeyPair: CryptoKeyPair;
  sigKeyPair: CryptoKeyPair;
  encPublicJwk: string;
  sigPublicJwk: string;
}

/** 새 키 세트 생성. 개인키는 추출 불가(extractable=false), 공개키는 항상 추출 가능 */
export async function generateKeySet(): Promise<GeneratedKeySet> {
  const rsa = { modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) };
  const [encKeyPair, sigKeyPair] = await Promise.all([
    crypto.subtle.generateKey({ ...RSA_OAEP, ...rsa }, false, ["encrypt", "decrypt"]),
    crypto.subtle.generateKey({ ...RSA_PSS, ...rsa }, false, ["sign", "verify"]),
  ]);
  return {
    encKeyPair,
    sigKeyPair,
    encPublicJwk: JSON.stringify(await crypto.subtle.exportKey("jwk", encKeyPair.publicKey)),
    sigPublicJwk: JSON.stringify(await crypto.subtle.exportKey("jwk", sigKeyPair.publicKey)),
  };
}

export function importEncPublicKey(jwk: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", JSON.parse(jwk), RSA_OAEP, false, ["encrypt"]);
}

export function importSigPublicKey(jwk: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", JSON.parse(jwk), RSA_PSS, false, ["verify"]);
}

/** 안전번호: SHA-256(암호화공개키 + "\n" + 서명공개키) — 서버(MessengerKeyService)와 같은 방식 */
export async function computeFingerprint(encPublicJwk: string, sigPublicJwk: string): Promise<string> {
  return (await sha256Hex(te.encode(`${encPublicJwk}\n${sigPublicJwk}`))).toUpperCase();
}

/** "1A2B 3C4D ..." 형태로 앞 40자리만 보기 좋게 */
export function formatFingerprint(fp: string | null | undefined): string {
  if (!fp) return "-";
  return (fp.slice(0, 40).match(/.{1,4}/g) ?? []).join(" ");
}

// ------------------------------------------------------------------ 암호화 (보내는 쪽)

function signingBytes(senderId: number, receiverId: number, payloadBytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return concat(te.encode(`v1|${senderId}|${receiverId}|`), payloadBytes);
}

export interface EncryptInput {
  senderId: number;
  receiverId: number;
  text: string;
  file?: File | null;
  receiverEncPublicKey: CryptoKey;
  senderEncPublicKey: CryptoKey;
  senderSigPrivateKey: CryptoKey;
}

export interface EncryptOutput {
  clientMessageId: string;
  encKeyForReceiver: string;
  encKeyForSender: string;
  iv: string;
  ciphertext: string;
  signature: string;
  encryptedFile: Blob | null;
}

export async function encryptMessage(input: EncryptInput): Promise<EncryptOutput> {
  const clientMessageId = crypto.randomUUID();

  // 1) 1회용 AES 키
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

  // 2) 첨부파일 암호화 (원본 해시는 서명되는 본문에 들어감)
  let fileMeta: FileMeta | undefined;
  let encryptedFile: Blob | null = null;
  if (input.file) {
    const plainFile = new Uint8Array(await input.file.arrayBuffer());
    const fileIv = randomBytes(12);
    const cipherFile = await crypto.subtle.encrypt({ name: "AES-GCM", iv: fileIv }, aesKey, plainFile);
    fileMeta = {
      name: input.file.name,
      type: input.file.type || "application/octet-stream",
      size: input.file.size,
      iv: bytesToB64(fileIv),
      sha256: await sha256Hex(plainFile),
    };
    encryptedFile = new Blob([cipherFile], { type: "application/octet-stream" });
  }

  // 3) 본문 암호화
  const payload: MessagePayload = {
    v: 1,
    id: clientMessageId,
    text: input.text,
    sentAt: new Date().toISOString(),
    ...(fileMeta ? { file: fileMeta } : {}),
  };
  const payloadBytes = te.encode(JSON.stringify(payload));
  const iv = randomBytes(12);
  const cipherBody = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, payloadBytes);

  // 4) AES 키를 받는 사람 / 나 각각의 공개키로 감싸기
  const rawAes = await crypto.subtle.exportKey("raw", aesKey);
  const [forReceiver, forSender] = await Promise.all([
    crypto.subtle.encrypt({ name: "RSA-OAEP" }, input.receiverEncPublicKey, rawAes),
    crypto.subtle.encrypt({ name: "RSA-OAEP" }, input.senderEncPublicKey, rawAes),
  ]);

  // 5) 전자서명
  const signature = await crypto.subtle.sign(
    PSS_PARAMS,
    input.senderSigPrivateKey,
    signingBytes(input.senderId, input.receiverId, payloadBytes),
  );

  return {
    clientMessageId,
    encKeyForReceiver: bytesToB64(forReceiver),
    encKeyForSender: bytesToB64(forSender),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(cipherBody),
    signature: bytesToB64(signature),
    encryptedFile,
  };
}

// ------------------------------------------------------------------ 복호화 (받는 쪽)

export interface DecryptResult {
  payload: MessagePayload;
  verified: boolean;
  aesKey: CryptoKey;
}

/**
 * @param myEncPrivateKey  내가 받은 메시지면 receiverKeyId 의 개인키, 내가 보낸 메시지면 senderKeyId 의 개인키
 * @param senderSigPublicKey 보낸 사람의 (그 당시) 서명 공개키. 없으면 검증 실패로 표시
 */
export async function decryptMessage(
  message: EncryptedMessage,
  myUserId: number,
  myEncPrivateKey: CryptoKey,
  senderSigPublicKey: CryptoKey | null,
): Promise<DecryptResult> {
  const wrapped = message.senderId === myUserId ? message.encKeyForSender : message.encKeyForReceiver;

  const rawAes = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, myEncPrivateKey, b64ToBytes(wrapped));
  const aesKey = await crypto.subtle.importKey("raw", rawAes, { name: "AES-GCM" }, false, ["decrypt"]);

  // 암호문이 바뀌었으면 GCM 인증 태그가 맞지 않아 여기서 예외 발생
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(message.iv) },
    aesKey,
    b64ToBytes(message.ciphertext),
  );
  const plainBytes = new Uint8Array(plain);
  const payload = JSON.parse(td.decode(plainBytes)) as MessagePayload;

  let verified = false;
  if (senderSigPublicKey) {
    verified = await crypto.subtle.verify(
      PSS_PARAMS,
      senderSigPublicKey,
      b64ToBytes(message.signature),
      signingBytes(message.senderId, message.receiverId, plainBytes),
    );
  }
  // 서명된 본문의 id 와 서버에 저장된 id 가 다르면 → 다른 메시지를 복사해 끼워 넣은 것
  if (payload.id !== message.clientMessageId) verified = false;

  return { payload, verified, aesKey };
}

/** 첨부파일 복호화 + 원본 해시 확인 (위변조되었으면 예외) */
export async function decryptFile(aesKey: CryptoKey, meta: FileMeta, cipher: ArrayBuffer): Promise<Blob> {
  let plain: ArrayBuffer;
  try {
    // 암호문이 1비트라도 바뀌면 GCM 인증 태그가 맞지 않아 실패
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(meta.iv) }, aesKey, cipher);
  } catch {
    throw new Error("파일 복호화 실패 — 전송 중 손상되었거나 변조된 파일입니다.");
  }
  const hash = await sha256Hex(plain);
  if (hash !== meta.sha256) {
    throw new Error("파일 해시가 일치하지 않습니다. 파일이 손상되었거나 변조되었습니다.");
  }
  return new Blob([plain], { type: meta.type || "application/octet-stream" });
}
