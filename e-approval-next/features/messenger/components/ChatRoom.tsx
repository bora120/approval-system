"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { User } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";
import { messengerApi } from "../api";
import { POLL_CHAT_MS } from "../constants";
import { assertFingerprint, decryptAll, sendSecureMessage, type MessengerSession } from "../engine";
import type { Contact, DecryptedMessage, EncryptedMessage, KeyInfo } from "../types";
import { formatDateLabel } from "../utils";
import Composer from "./Composer";
import MessageBubble from "./MessageBubble";
import SafetyNumber from "./SafetyNumber";

interface Props {
  me: User;
  session: MessengerSession;
  partner: Contact;
  onActivity: () => void; // 대화 목록 새로고침 요청
}

/** 서버에서 바뀔 수 있는 값(읽음·파일 상태)만 최신으로 덮어쓴다 (복호화 결과는 그대로) */
function withServerState(m: DecryptedMessage, latest: EncryptedMessage | undefined): DecryptedMessage {
  if (!latest) return m;
  const r = m.raw;
  if (
    r.readAt === latest.readAt &&
    r.fileDownloadedAt === latest.fileDownloadedAt &&
    r.fileDeletedAt === latest.fileDeletedAt
  ) {
    return m;
  }
  return {
    ...m,
    raw: {
      ...r,
      readAt: latest.readAt ?? r.readAt,
      fileDownloadedAt: latest.fileDownloadedAt,
      fileDeletedAt: latest.fileDeletedAt,
      fileDeleteReason: latest.fileDeleteReason,
    },
  };
}

function mergeById(prev: DecryptedMessage[], incoming: DecryptedMessage[]): DecryptedMessage[] {
  const map = new Map(prev.map((m) => [m.raw.id, m]));
  for (const m of incoming) map.set(m.raw.id, m);
  return [...map.values()].sort((a, b) => a.raw.id - b.raw.id);
}

export default function ChatRoom({ me, session, partner, onActivity }: Props) {
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");
  const [partnerKey, setPartnerKey] = useState<KeyInfo | null>(null);
  const [partnerKeyMissing, setPartnerKeyMissing] = useState(false);
  const [showSafety, setShowSafety] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<DecryptedMessage[]>([]);
  messagesRef.current = messages;
  const stickToBottom = useRef(true);
  const keepScrollFrom = useRef<number | null>(null);

  const ready = session.status === "ready" && !!session.ring;
  const ring = session.ring;

  // 부모가 매 렌더마다 새 함수를 넘겨도 아래 effect 들이 다시 실행되지 않도록 ref 로 보관
  const onActivityRef = useRef(onActivity);
  useEffect(() => {
    onActivityRef.current = onActivity;
  }, [onActivity]);

  // ---------------------------------------------------------- 읽음 처리
  const markReadIfNeeded = useCallback(
    async (list: DecryptedMessage[]) => {
      if (!list.some((m) => !m.mine && !m.raw.readAt)) return;
      await messengerApi.markRead(partner.id).catch(() => {});
      const now = new Date().toISOString();
      // 화면에서도 읽음으로 표시해 같은 요청이 반복되지 않게 함
      setMessages((prev) => prev.map((m) => (!m.mine && !m.raw.readAt ? { ...m, raw: { ...m.raw, readAt: now } } : m)));
      window.dispatchEvent(new Event("messenger-read"));
      onActivityRef.current();
    },
    [partner.id],
  );

  // ---------------------------------------------------------- 처음 불러오기
  useEffect(() => {
    if (!ring) return;
    let active = true;
    setMessages([]);
    setLoading(true);
    setError("");
    stickToBottom.current = true;

    messengerApi
      .messages(partner.id)
      .then(async (page) => {
        const list = await decryptAll(page.messages, page.keys, me.id, ring);
        if (!active) return;
        setMessages(list);
        setHasMore(page.hasMore);
        void markReadIfNeeded(list);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));

    // 상대 공개키 (보내기 + 안전번호용)
    setPartnerKey(null);
    setPartnerKeyMissing(false);
    messengerApi
      .contactKey(partner.id)
      .then(async (k) => {
        await assertFingerprint(k);
        if (active) setPartnerKey(k);
      })
      .catch((e: unknown) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 404) setPartnerKeyMissing(true);
        else setError(e instanceof Error ? e.message : "상대방 키를 확인할 수 없습니다.");
      });

    return () => {
      active = false;
    };
  }, [partner.id, me.id, ring, markReadIfNeeded]);

  // ---------------------------------------------------------- 실시간 갱신 (폴링)
  useEffect(() => {
    if (!ring) return;
    let active = true;
    let busy = false;
    let ticks = 0;

    const tick = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const current = messagesRef.current;
        const lastId = current.length ? current[current.length - 1].raw.id : 0;

        // 1) 새 메시지
        const page = await messengerApi.messages(partner.id, { afterId: lastId, limit: 100 });
        if (page.messages.length) {
          const fresh = await decryptAll(page.messages, page.keys, me.id, ring);
          if (!active) return;
          setMessages((prev) => mergeById(prev, fresh));
          void markReadIfNeeded(fresh);
          if (!partnerKey) {
            messengerApi.contactKey(partner.id).then((k) => active && setPartnerKey(k)).catch(() => {});
          }
        }

        // 2) 상태 갱신: 내 메시지 읽음 여부, 파일 수신 확인·삭제 여부
        const needsRefresh = current.some(
          (m) => (m.mine && !m.raw.readAt) || (m.raw.hasFile && !m.raw.fileDeletedAt && (m.mine ? !m.raw.fileDownloadedAt : true)),
        );
        // 새 메시지는 매번, 상태 갱신은 3번에 1번만 (요청 수 줄이기)
        ticks += 1;
        if (needsRefresh && ticks % 3 === 0) {
          const recent = await messengerApi.messages(partner.id, { limit: 30 });
          const byId = new Map(recent.messages.map((m) => [m.id, m]));
          if (!active) return;
          setMessages((prev) => prev.map((m) => withServerState(m, byId.get(m.raw.id))));
        }
      } catch {
        // 일시적인 네트워크 오류는 다음 주기에 다시 시도
      } finally {
        busy = false;
      }
    };

    const timer = setInterval(tick, POLL_CHAT_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [partner.id, me.id, ring, partnerKey, markReadIfNeeded]);

  // ---------------------------------------------------------- 스크롤
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (keepScrollFrom.current != null) {
      el.scrollTop = el.scrollHeight - keepScrollFrom.current;
      keepScrollFrom.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // ---------------------------------------------------------- 이전 메시지
  const loadOlder = async () => {
    if (!ring || !messages.length) return;
    setLoadingOlder(true);
    try {
      const page = await messengerApi.messages(partner.id, { beforeId: messages[0].raw.id });
      const older = await decryptAll(page.messages, page.keys, me.id, ring);
      keepScrollFrom.current = (listRef.current?.scrollHeight ?? 0) - (listRef.current?.scrollTop ?? 0);
      setMessages((prev) => mergeById(prev, older));
      setHasMore(page.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "이전 메시지를 불러오지 못했습니다.");
    } finally {
      setLoadingOlder(false);
    }
  };

  // ---------------------------------------------------------- 전송
  const send = async (text: string, file: File | null) => {
    if (!ring || !session.myKey) throw new Error("보안 키가 준비되지 않았습니다.");
    const sent = await sendSecureMessage({ me, session, partnerId: partner.id, text, file });
    const [decrypted] = await decryptAll([sent], [session.myKey], me.id, ring);
    stickToBottom.current = true;
    setMessages((prev) => mergeById(prev, [decrypted]));
    onActivityRef.current();
  };

  // ---------------------------------------------------------- 화면
  const lastReadMineId = [...messages].reverse().find((m) => m.mine && m.raw.readAt)?.raw.id ?? null;
  const composerReason = !ready
    ? "보안 키가 준비되면 메시지를 보낼 수 있어요."
    : partnerKeyMissing
      ? `${partner.name}님이 아직 메신저에 접속하지 않아 보안 키가 없습니다. 상대가 메신저를 한 번 열면 보낼 수 있어요.`
      : undefined;

  return (
    <section className="sm-chat">
      <header className="sm-chat-head">
        <span className="sm-avatar">{partner.name.slice(0, 1)}</span>
        <div className="sm-chat-title">
          <strong>{partner.name}</strong>
          <small>
            {partner.department ?? "-"} · {partner.positionLabel}
          </small>
        </div>
        <span className="sm-e2e">종단간 암호화</span>
        <button className="sm-btn sm-btn--ghost sm-btn--small" onClick={() => setShowSafety(true)} disabled={!partnerKey}>
          안전번호
        </button>
      </header>

      <div className="sm-messages" ref={listRef} onScroll={onScroll}>
        {hasMore && (
          <div className="sm-center">
            <button className="sm-btn sm-btn--ghost sm-btn--small" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder ? "불러오는 중..." : "이전 메시지 더 보기"}
            </button>
          </div>
        )}
        {loading && <p className="sm-muted sm-center">메시지를 복호화하는 중...</p>}
        {!loading && !error && messages.length === 0 && (
          <p className="sm-muted sm-center">
            {partner.name}님과의 첫 메시지를 보내 보세요. 내용은 두 사람의 브라우저에서만 볼 수 있어요.
          </p>
        )}
        {error && <p className="sm-error sm-center">{error}</p>}

        {messages.map((m, i) => {
          const day = new Date(m.raw.createdAt).toDateString();
          const prevDay = i > 0 ? new Date(messages[i - 1].raw.createdAt).toDateString() : null;
          return (
            <Fragment key={m.raw.id}>
              {day !== prevDay && <div className="sm-day">{formatDateLabel(m.raw.createdAt)}</div>}
              <MessageBubble
                message={m}
                showRead={m.raw.id === lastReadMineId}
                onUpdate={(raw) => setMessages((prev) => prev.map((x) => (x.raw.id === raw.id ? withServerState(x, raw) : x)))}
              />
            </Fragment>
          );
        })}
      </div>

      <Composer disabled={!ready || partnerKeyMissing} disabledReason={composerReason} onSend={send} />

      {showSafety && (
        <SafetyNumber
          myFingerprint={session.myKey?.fingerprint ?? null}
          partnerName={partner.name}
          partnerFingerprint={partnerKey?.fingerprint ?? null}
          onClose={() => setShowSafety(false)}
        />
      )}
    </section>
  );
}
