/**
 * 메신저 동작 묶음: 내 키 준비, 메시지 복호화, 암호화 전송.
 * 화면(컴포넌트)은 이 파일의 함수만 쓰면 되도록 암호 처리를 한 곳에 모았다.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";
import { messengerApi } from "./api";
import {
  computeFingerprint,
  decryptMessage,
  encryptMessage,
  generateKeySet,
  importEncPublicKey,
  importSigPublicKey,
  isCryptoAvailable,
} from "./crypto";
import { getLocalKeys, listLocalKeys, saveLocalKeys, type LocalKeyRecord } from "./keystore";
import type { DecryptedMessage, EncryptedMessage, KeyInfo } from "./types";

// ================================================================== 키 링 (키 캐시)

/** 복호화·검증에 필요한 키를 한 번만 불러오도록 보관 */
export class KeyRing {
  private readonly local = new Map<number, Promise<LocalKeyRecord | null>>();
  private readonly sigPub = new Map<number, Promise<CryptoKey>>();
  private readonly encPub = new Map<number, Promise<CryptoKey>>();

  constructor(private readonly loginId: string) {}

  myKeys(keyId: number): Promise<LocalKeyRecord | null> {
    if (!this.local.has(keyId)) this.local.set(keyId, getLocalKeys(this.loginId, keyId).catch(() => null));
    return this.local.get(keyId)!;
  }

  remember(record: LocalKeyRecord) {
    this.local.set(record.keyId, Promise.resolve(record));
  }

  sigPublic(info: KeyInfo): Promise<CryptoKey> {
    if (!this.sigPub.has(info.keyId)) this.sigPub.set(info.keyId, importSigPublicKey(info.sigPublicKey));
    return this.sigPub.get(info.keyId)!;
  }

  encPublic(info: KeyInfo): Promise<CryptoKey> {
    if (!this.encPub.has(info.keyId)) this.encPub.set(info.keyId, importEncPublicKey(info.encPublicKey));
    return this.encPub.get(info.keyId)!;
  }
}

// ================================================================== 내 키 준비

/**
 * checking        준비 중
 * unsupported     http(비보안) 주소라 Web Crypto 사용 불가
 * ready           메시지를 보내고 받을 수 있음
 * missing-local   이 브라우저에 내 개인키가 하나도 없음 (다른 PC에서 처음 키를 만든 경우 등)
 * outdated-local  이 브라우저의 키는 예전 것 (다른 브라우저에서 새 키를 만듦) → 예전 메시지만 읽기 가능
 * error           오류
 */
export type SessionStatus = "checking" | "unsupported" | "ready" | "missing-local" | "outdated-local" | "error";

export interface MessengerSession {
  status: SessionStatus;
  myKey: KeyInfo | null;
  local: LocalKeyRecord | null;
  ring: KeyRing | null;
  error: string;
  /** 이 브라우저에 키가 없을 때 새 키 만들기 (예전 메시지는 이 브라우저에서 못 읽음) */
  regenerate: () => Promise<void>;
}

// 같은 사용자의 키 생성이 동시에 두 번 일어나지 않도록 (React 개발 모드의 effect 2회 실행 등)
const creating = new Map<string, Promise<{ info: KeyInfo; record: LocalKeyRecord }>>();

async function createKeys(loginId: string) {
  if (!creating.has(loginId)) {
    const job = (async () => {
      const gen = await generateKeySet();
      const info = await messengerApi.registerKey(gen.encPublicJwk, gen.sigPublicJwk);
      const record: LocalKeyRecord = {
        loginId,
        keyId: info.keyId,
        encPrivateKey: gen.encKeyPair.privateKey,
        encPublicKey: gen.encKeyPair.publicKey,
        sigPrivateKey: gen.sigKeyPair.privateKey,
        createdAt: new Date().toISOString(),
      };
      await saveLocalKeys(record);
      return { info, record };
    })().finally(() => creating.delete(loginId));
    creating.set(loginId, job);
  }
  return creating.get(loginId)!;
}

/** 서버가 준 공개키와 안전번호가 서로 맞는지 확인 (키 바꿔치기 탐지) */
export async function assertFingerprint(info: KeyInfo) {
  const fp = await computeFingerprint(info.encPublicKey, info.sigPublicKey);
  if (fp !== info.fingerprint) {
    throw new Error("서버가 보낸 공개키의 안전번호가 일치하지 않습니다. 관리자에게 알리세요.");
  }
}

export function useMessengerSession(user: User | null): MessengerSession {
  const [status, setStatus] = useState<SessionStatus>("checking");
  const [myKey, setMyKey] = useState<KeyInfo | null>(null);
  const [local, setLocal] = useState<LocalKeyRecord | null>(null);
  const [ring, setRing] = useState<KeyRing | null>(null);
  const [error, setError] = useState("");

  const applyNew = useCallback((info: KeyInfo, record: LocalKeyRecord, r: KeyRing) => {
    r.remember(record);
    setMyKey(info);
    setLocal(record);
    setStatus("ready");
  }, []);

  const loginId = user?.loginId ?? null;

  useEffect(() => {
    if (!loginId) return;
    let active = true;
    const r = new KeyRing(loginId);
    setRing(r);
    setStatus("checking");
    setError("");

    (async () => {
      if (!isCryptoAvailable()) {
        if (active) setStatus("unsupported");
        return;
      }
      const server = await messengerApi.myKey();
      if (!server) {
        // 처음 사용하는 사용자 → 키 자동 생성
        const { info, record } = await createKeys(loginId);
        if (active) applyNew(info, record, r);
        return;
      }
      await assertFingerprint(server);
      const rec = await r.myKeys(server.keyId);
      const olderKeys = rec ? [] : await listLocalKeys(loginId).catch(() => []);
      if (!active) return;
      setMyKey(server);
      setLocal(rec);
      setStatus(rec ? "ready" : olderKeys.length ? "outdated-local" : "missing-local");
    })().catch((e: unknown) => {
      if (!active) return;
      setError(e instanceof Error ? e.message : "메신저를 준비하지 못했습니다.");
      setStatus("error");
    });

    return () => {
      active = false;
    };
  }, [loginId, applyNew]);

  const regenerate = useCallback(async () => {
    if (!loginId || !ring) return;
    setStatus("checking");
    try {
      const { info, record } = await createKeys(loginId);
      applyNew(info, record, ring);
    } catch (e) {
      setError(e instanceof Error ? e.message : "키를 만들지 못했습니다.");
      setStatus("error");
    }
  }, [loginId, ring, applyNew]);

  return { status, myKey, local, ring, error, regenerate };
}

// ================================================================== 복호화

export async function decryptAll(
  messages: EncryptedMessage[],
  keys: KeyInfo[],
  myUserId: number,
  ring: KeyRing,
): Promise<DecryptedMessage[]> {
  const keyById = new Map(keys.map((k) => [k.keyId, k]));

  return Promise.all(
    messages.map(async (m): Promise<DecryptedMessage> => {
      const mine = m.senderId === myUserId;
      const base = { raw: m, mine, payload: null, verified: false, aesKey: null };
      const myKeyId = mine ? m.senderKeyId : m.receiverKeyId;
      const myKeys = await ring.myKeys(myKeyId);
      if (!myKeys) {
        return { ...base, error: "이 브라우저에 이 메시지를 열 수 있는 키가 없습니다." };
      }
      try {
        const senderInfo = keyById.get(m.senderKeyId);
        const senderSig = senderInfo ? await ring.sigPublic(senderInfo) : null;
        const r = await decryptMessage(m, myUserId, myKeys.encPrivateKey, senderSig);
        return { ...base, payload: r.payload, verified: r.verified, aesKey: r.aesKey, error: null };
      } catch {
        return { ...base, error: "복호화 실패 — 데이터가 손상되었거나 키가 맞지 않습니다." };
      }
    }),
  );
}

// ================================================================== 전송

export type SendPhase = "encrypting" | "uploading";

export interface SendInput {
  me: User;
  session: MessengerSession;
  partnerId: number;
  text: string;
  file?: File | null;
  /** 진행 상황: 암호화 중 → 업로드 중(0~1) */
  onProgress?: (phase: SendPhase, ratio: number) => void;
  signal?: AbortSignal;
}

/** 상대 공개키를 받아 암호화 → 전송. 상대가 그 사이 키를 바꿨으면 한 번 더 시도 */
export async function sendSecureMessage({
  me,
  session,
  partnerId,
  text,
  file,
  onProgress,
  signal,
}: SendInput): Promise<EncryptedMessage> {
  const { myKey, local, ring } = session;
  if (session.status !== "ready" || !myKey || !local || !ring) {
    throw new Error("보안 키가 준비되지 않았습니다.");
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new ApiError(-1, "전송을 취소했습니다.");
    onProgress?.("encrypting", 0);

    const receiverKey = await messengerApi.contactKey(partnerId);
    await assertFingerprint(receiverKey);

    const out = await encryptMessage({
      senderId: me.id,
      receiverId: partnerId,
      text,
      file,
      receiverEncPublicKey: await ring.encPublic(receiverKey),
      senderEncPublicKey: local.encPublicKey,
      senderSigPrivateKey: local.sigPrivateKey,
    });
    const { encryptedFile, ...fields } = out;

    try {
      onProgress?.("uploading", 0);
      return await messengerApi.send(
        { ...fields, receiverId: partnerId, senderKeyId: myKey.keyId, receiverKeyId: receiverKey.keyId },
        encryptedFile,
        { signal, onProgress: (loaded, total) => onProgress?.("uploading", total ? loaded / total : 0) },
      );
    } catch (e) {
      const retryable = e instanceof ApiError && e.status === 409 && e.message.includes("상대방");
      if (!retryable || attempt === 1) throw e;
    }
  }
  throw new Error("전송에 실패했습니다.");
}
