"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthState } from "@/lib/auth";
import { messengerApi } from "../api";
import ChatRoom from "../components/ChatRoom";
import ContactPicker from "../components/ContactPicker";
import ConversationList from "../components/ConversationList";
import KeyStatus from "../components/KeyStatus";
import { POLL_CONVERSATIONS_MS } from "../constants";
import { useMessengerSession } from "../engine";
import type { Contact, Conversation } from "../types";

/** 메신저 화면 (/messenger?with=상대ID) */
export default function MessengerPage() {
  const { user } = useAuthState();
  const session = useMessengerSession(user);
  const router = useRouter();
  const searchParams = useSearchParams();
  const withParam = Number(searchParams.get("with"));
  const selectedId = Number.isInteger(withParam) && withParam > 0 ? withParam : null;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConv, setLoadingConv] = useState(true);
  const [picking, setPicking] = useState(false);
  const [extraContact, setExtraContact] = useState<Contact | null>(null);
  const [error, setError] = useState("");

  // ---------------- 대화 목록 (주기적으로 갱신)
  const refresh = useCallback(() => {
    messengerApi
      .conversations()
      .then((list) => {
        setConversations(list);
        setError("");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingConv(false));
  }, []);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    refresh();
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), POLL_CONVERSATIONS_MS);
    return () => clearInterval(timer);
  }, [userId, refresh]);

  // ---------------- 선택한 상대 정보
  const fromList = conversations.find((c) => c.partner.id === selectedId)?.partner ?? null;
  const partner = fromList ?? (extraContact?.id === selectedId ? extraContact : null);

  // 대화 목록에 없는 상대(새 대화, 다른 화면의 링크)면 연락처에서 찾기
  useEffect(() => {
    if (!userId || !selectedId || fromList || extraContact?.id === selectedId) return;
    let active = true;
    messengerApi
      .contacts()
      .then((list) => {
        if (!active) return;
        const found = list.find((c) => c.id === selectedId);
        if (found) setExtraContact(found);
        else setError("대화 상대를 찾을 수 없습니다.");
      })
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [userId, selectedId, fromList, extraContact]);

  const select = (id: number) => {
    setPicking(false);
    router.replace(`/messenger?with=${id}`);
  };

  if (!user) return <main className="main">불러오는 중...</main>;

  return (
    <main className="sm-page">
      <nav className="sm-breadcrumb">
        <Link href="/">홈</Link> › 메신저
      </nav>
      <KeyStatus session={session} />
      {error && <div className="sm-banner sm-banner--error">{error}</div>}

      <div className={`sm-layout ${partner ? "has-chat" : ""}`}>
        <aside className="sm-sidebar">
          <div className="sm-sidebar-head">
            <h2>대화</h2>
            <button className="sm-btn sm-btn--primary sm-btn--small" onClick={() => setPicking((v) => !v)}>
              {picking ? "취소" : "+ 새 대화"}
            </button>
          </div>
          {picking ? (
            <ContactPicker
              autoFocus
              selectedId={selectedId}
              onSelect={(c) => {
                setExtraContact(c);
                select(c.id);
              }}
            />
          ) : (
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              loading={loadingConv}
              onSelect={select}
            />
          )}
          <div className="sm-sidebar-links">
            <Link href="/send">파일 보내기</Link>
            <Link href="/files">파일함</Link>
          </div>
        </aside>

        <div className="sm-main">
          {partner ? (
            <>
              <button className="sm-back" onClick={() => router.replace("/messenger")}>
                ← 대화 목록
              </button>
              <ChatRoom key={partner.id} me={user} session={session} partner={partner} onActivity={refresh} />
            </>
          ) : (
            <div className="sm-empty">
              
              <h3>종단간 암호화 메신저</h3>
              <p>
                메시지와 파일은 내 브라우저에서 암호화되어 전송되고, 받는 사람의 브라우저에서만 열 수 있어요.
                <br />
                서버와 관리자도 내용을 볼 수 없습니다.
              </p>
              <button className="sm-btn sm-btn--primary" onClick={() => setPicking(true)}>
                대화 상대 찾기
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
