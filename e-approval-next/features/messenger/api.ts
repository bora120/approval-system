import { api, ApiError, readErrorMessage } from "@/lib/api-client";
import type { Contact, Conversation, EncryptedMessage, FilePage, KeyInfo, MessagePage } from "./types";
import type { EncryptOutput } from "./crypto";

const BASE = "/api/messenger";

export const messengerApi = {
  /** 내 현재 공개키 (없으면 undefined) */
  myKey: () => api<KeyInfo | undefined>(`${BASE}/keys/me`),

  registerKey: (encPublicKey: string, sigPublicKey: string) =>
    api<KeyInfo>(`${BASE}/keys`, { method: "POST", body: JSON.stringify({ encPublicKey, sigPublicKey }) }),

  contacts: (keyword = "") => api<Contact[]>(`${BASE}/contacts?keyword=${encodeURIComponent(keyword)}`),

  contactKey: (userId: number) => api<KeyInfo>(`${BASE}/contacts/${userId}/key`),

  conversations: () => api<Conversation[]>(`${BASE}/conversations`),

  messages: (partnerId: number, opts: { afterId?: number; beforeId?: number; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.afterId != null) q.set("afterId", String(opts.afterId));
    if (opts.beforeId != null) q.set("beforeId", String(opts.beforeId));
    if (opts.limit != null) q.set("limit", String(opts.limit));
    const qs = q.toString();
    return api<MessagePage>(`${BASE}/conversations/${partnerId}/messages${qs ? `?${qs}` : ""}`);
  },

  markRead: (partnerId: number) => api<{ updated: number }>(`${BASE}/conversations/${partnerId}/read`, { method: "POST" }),

  unreadCount: () => api<{ count: number }>(`${BASE}/unread-count`),

  /**
   * 암호화된 메시지(+파일) 전송.
   * 업로드 진행률을 알기 위해 fetch 대신 XMLHttpRequest 를 사용한다.
   */
  send(
    body: Omit<EncryptOutput, "encryptedFile"> & { receiverId: number; senderKeyId: number; receiverKeyId: number },
    encryptedFile: Blob | null,
    opts: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal } = {},
  ): Promise<EncryptedMessage> {
    const form = new FormData();
    form.append("data", new Blob([JSON.stringify(body)], { type: "application/json" }));
    if (encryptedFile) form.append("file", encryptedFile, "encrypted.bin");

    return new Promise<EncryptedMessage>((resolve, reject) => {
      if (opts.signal?.aborted) return reject(new ApiError(-1, "전송을 취소했습니다."));
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE}/messages`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress?.(e.loaded, e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as EncryptedMessage);
          } catch {
            reject(new ApiError(xhr.status, "서버 응답을 읽을 수 없습니다."));
          }
          return;
        }
        // 에러 메시지 해석은 fetch 쪽과 같은 함수를 재사용
        readErrorMessage(new Response(xhr.responseText, { status: xhr.status }), "전송에 실패했습니다.")
          .then((msg) => reject(new ApiError(xhr.status, msg)))
          .catch(() => reject(new ApiError(xhr.status, "전송에 실패했습니다.")));
      };
      xhr.onerror = () => reject(new ApiError(0, "서버에 연결할 수 없습니다."));
      xhr.onabort = () => reject(new ApiError(-1, "전송을 취소했습니다."));
      opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.send(form);
    });
  },

  /** 첨부파일 삭제 (보낸 사람: 전송 취소 / 받는 사람: 삭제) */
  deleteFile: (messageId: number) => api<EncryptedMessage>(`${BASE}/messages/${messageId}/file`, { method: "DELETE" }),

  /** 파일함: box = received | sent */
  files: (box: "received" | "sent", beforeId?: number, limit = 30) => {
    const q = new URLSearchParams({ box, limit: String(limit) });
    if (beforeId != null) q.set("beforeId", String(beforeId));
    return api<FilePage>(`${BASE}/files?${q.toString()}`);
  },

  /** 암호화된 첨부파일 내려받기 (복호화는 호출한 쪽에서) */
  async downloadFile(messageId: number): Promise<ArrayBuffer> {
    let res: Response;
    try {
      res = await fetch(`${BASE}/messages/${messageId}/file`, { credentials: "include" });
    } catch {
      throw new ApiError(0, "서버에 연결할 수 없습니다.");
    }
    if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res, "파일을 받을 수 없습니다."));
    return res.arrayBuffer();
  },
};
