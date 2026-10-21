export interface KeyInfo {
  keyId: number;
  userId: number;
  encPublicKey: string; // JWK JSON 문자열
  sigPublicKey: string;
  fingerprint: string;
  active: boolean;
  createdAt: string;
}

export interface Contact {
  id: number;
  name: string;
  department: string | null;
  positionLabel: string;
  hasKey: boolean;
  fingerprint: string | null;
}

export interface Conversation {
  partner: Contact;
  lastMessageId: number;
  lastMessageAt: string;
  lastFromMe: boolean;
  lastHasFile: boolean;
  unreadCount: number;
}

/** 서버가 내려주는 암호화된 메시지 */
export interface EncryptedMessage {
  id: number;
  clientMessageId: string;
  senderId: number;
  receiverId: number;
  senderKeyId: number;
  receiverKeyId: number;
  encKeyForReceiver: string;
  encKeyForSender: string;
  iv: string;
  ciphertext: string;
  signature: string;
  hasFile: boolean;
  fileCipherSize: number | null;
  fileCipherSha256: string | null;
  fileExpiresAt: string | null;     // 보관 기한 (지나면 자동 삭제)
  fileDownloadedAt: string | null;  // 받는 사람이 처음 내려받은 시각 (수신 확인)
  fileDeletedAt: string | null;     // 전송 취소·삭제·만료된 시각
  fileDeleteReason: string | null;  // 삭제 사유 (화면 표시용 문구)
  createdAt: string;
  readAt: string | null;
}

export interface MessagePage {
  messages: EncryptedMessage[];
  keys: KeyInfo[];
  hasMore: boolean;
}

/** 암호문 안에 들어 있는 실제 내용 (서버는 볼 수 없음) */
export interface FileMeta {
  name: string;
  type: string;
  size: number;
  iv: string;      // 파일 암호화에 쓴 IV (base64)
  sha256: string;  // 원본 파일 해시 (hex) → 받은 뒤 위변조 확인
}

export interface MessagePayload {
  v: 1;
  id: string;      // clientMessageId 와 같아야 함 (재전송 방지)
  text: string;
  sentAt: string;
  file?: FileMeta;
}

/** 화면에 보여줄 복호화 결과 */
export interface DecryptedMessage {
  raw: EncryptedMessage;
  mine: boolean;
  payload: MessagePayload | null;
  verified: boolean;
  error: string | null;
  aesKey: CryptoKey | null; // 첨부파일 복호화용
}

/** 파일함 한 줄 */
export interface FileItem {
  message: EncryptedMessage;
  partner: Contact;
  mine: boolean; // 내가 보낸 파일인지
}

export interface FilePage {
  items: FileItem[];
  keys: KeyInfo[];
  hasMore: boolean;
}

/** 파일 상태 (화면 표시용) */
export type FileState = "available" | "downloaded" | "deleted" | "expired";

export function fileStateOf(m: EncryptedMessage, now = Date.now()): FileState {
  if (m.fileDeletedAt) return "deleted";
  if (m.fileExpiresAt && new Date(m.fileExpiresAt).getTime() <= now) return "expired";
  if (m.fileDownloadedAt) return "downloaded";
  return "available";
}
