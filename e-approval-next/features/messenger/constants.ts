// 백엔드 MessengerLimits.java 와 값을 맞춰야 함

/** 서버가 받는 암호화 파일 최대 크기 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** 원본 파일 최대 크기 (AES-GCM 인증 태그 16바이트 여유) */
export const MAX_PLAIN_FILE_BYTES = MAX_FILE_BYTES - 1024;
/** 한 번에 보낼 수 있는 파일 수 / 받는 사람 수 */
export const MAX_FILES_PER_SEND = 10;
export const MAX_RECIPIENTS = 10;

/** 메시지 글자 수 제한 */
export const MAX_TEXT_LENGTH = 2000;

/** 새 메시지 확인 주기 (ms) */
export const POLL_CHAT_MS = 3000;
export const POLL_CONVERSATIONS_MS = 10000;
export const POLL_UNREAD_MS = 30000;

/** 받은 파일을 저장할 때 한 번 더 확인할 위험한 확장자 */
export const DANGEROUS_EXTENSIONS = [
  "exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "vbe", "js", "jse",
  "jar", "hta", "lnk", "reg", "dll", "sh",
];
