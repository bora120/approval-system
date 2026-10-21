"use client";

import { useEffect, useState } from "react";
import { messengerApi } from "../api";
import type { Contact } from "../types";

interface Props {
  onSelect: (contact: Contact) => void;
  onClose?: () => void;
  autoFocus?: boolean;
  selectedId?: number | null;
}

/** 대화 상대 검색 (이름 또는 부서) */
export default function ContactPicker({ onSelect, onClose, autoFocus, selectedId }: Props) {
  const [keyword, setKeyword] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      messengerApi
        .contacts(keyword)
        .then((list) => {
          if (!active) return;
          setContacts(list);
          setError("");
        })
        .catch((e: Error) => active && setError(e.message))
        .finally(() => active && setLoading(false));
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [keyword]);

  return (
    <div className="sm-picker">
      <div className="sm-picker-head">
        <input
          className="sm-input"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="이름 또는 부서 검색"
          autoFocus={autoFocus}
        />
        {onClose && (
          <button className="sm-btn sm-btn--ghost" onClick={onClose}>
            닫기
          </button>
        )}
      </div>
      {error && <p className="sm-error">{error}</p>}
      <ul className="sm-picker-list">
        {loading && contacts.length === 0 && <li className="sm-muted sm-pad">불러오는 중...</li>}
        {!loading && contacts.length === 0 && <li className="sm-muted sm-pad">검색 결과가 없습니다.</li>}
        {contacts.map((c) => (
          <li key={c.id}>
            <button
              className={`sm-picker-item ${selectedId === c.id ? "is-selected" : ""}`}
              onClick={() => onSelect(c)}
            >
              <span className="sm-avatar">{c.name.slice(0, 1)}</span>
              <span className="sm-picker-text">
                <strong>{c.name}</strong>
                <small>
                  {c.department ?? "-"} · {c.positionLabel}
                </small>
              </span>
              {!c.hasKey && <span className="sm-tag">메신저 미사용</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
