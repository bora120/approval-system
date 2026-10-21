"use client";

import type { Conversation } from "../types";
import { formatShortTime } from "../utils";

interface Props {
  conversations: Conversation[];
  selectedId: number | null;
  loading: boolean;
  onSelect: (partnerId: number) => void;
}

export default function ConversationList({ conversations, selectedId, loading, onSelect }: Props) {
  if (loading && conversations.length === 0) return <p className="sm-muted sm-pad">불러오는 중...</p>;
  if (conversations.length === 0) {
    return <p className="sm-muted sm-pad">아직 대화가 없습니다. &quot;새 대화&quot;로 시작해 보세요.</p>;
  }

  return (
    <ul className="sm-conv-list">
      {conversations.map((c) => (
        <li key={c.partner.id}>
          <button
            className={`sm-conv-item ${selectedId === c.partner.id ? "is-selected" : ""}`}
            onClick={() => onSelect(c.partner.id)}
          >
            <span className="sm-avatar">{c.partner.name.slice(0, 1)}</span>
            <span className="sm-conv-text">
              <span className="sm-conv-top">
                <strong>{c.partner.name}</strong>
                <small>{formatShortTime(c.lastMessageAt)}</small>
              </span>
              <span className="sm-conv-bottom">
                <small className="sm-muted">
                  {c.lastFromMe ? "나: " : ""}
                  {c.lastHasFile ? "파일" : "암호화된 메시지"}
                </small>
                {c.unreadCount > 0 && <span className="sm-unread">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
