/** 첨부파일 공통 동작: 저장(복호화+해시 확인), 상태 문구 */
"use client";

import { ApiError } from "@/lib/api-client";
import { messengerApi } from "./api";
import { DANGEROUS_EXTENSIONS } from "./constants";
import { decryptFile } from "./crypto";
import { fileStateOf, type DecryptedMessage, type EncryptedMessage } from "./types";
import { extensionOf, saveBlob } from "./utils";

/**
 * 암호화된 파일을 받아 내 브라우저에서 복호화하고, 원본 해시를 확인한 뒤 저장한다.
 * @returns 서버가 410(삭제/만료)을 돌려주면 false
 */
export async function saveSecureFile(m: DecryptedMessage): Promise<boolean> {
  const meta = m.payload?.file;
  if (!meta || !m.aesKey) throw new Error("이 파일을 열 수 있는 키가 없습니다.");

  if (DANGEROUS_EXTENSIONS.includes(extensionOf(meta.name))) {
    const ok = window.confirm(
      `"${meta.name}" 은(는) 실행 가능한 파일 형식입니다.\n보낸 사람을 확실히 믿을 수 있을 때만 저장하세요. 저장할까요?`,
    );
    if (!ok) return true;
  }
  try {
    const cipher = await messengerApi.downloadFile(m.raw.id);
    const blob = await decryptFile(m.aesKey, meta, cipher);
    saveBlob(blob, meta.name);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 410) return false;
    throw e;
  }
}

/** 남은 보관 일수 (D-3 등) */
export function daysLeft(m: EncryptedMessage, now = Date.now()): number | null {
  if (!m.fileExpiresAt) return null;
  return Math.ceil((new Date(m.fileExpiresAt).getTime() - now) / 86_400_000);
}

/** 파일 상태를 짧은 문구로 */
export function fileStatusText(m: EncryptedMessage, mine: boolean): string {
  const state = fileStateOf(m);
  if (state === "deleted") return m.fileDeleteReason ?? "삭제된 파일";
  if (state === "expired") return "보관 기간이 지나 삭제된 파일";
  const left = daysLeft(m);
  const keep = left != null ? ` · ${left <= 0 ? "오늘" : `${left}일 후`} 삭제` : "";
  if (mine) return (state === "downloaded" ? "✓ 상대가 받음" : "상대가 아직 받지 않음") + keep;
  return (state === "downloaded" ? "받은 파일" : "새 파일") + keep;
}
