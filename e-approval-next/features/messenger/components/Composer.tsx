"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { MAX_PLAIN_FILE_BYTES, MAX_TEXT_LENGTH } from "../constants";
import { formatBytes } from "../utils";

interface Props {
  disabled: boolean;
  disabledReason?: string;
  onSend: (text: string, file: File | null) => Promise<void>;
}

/** 입력창: Enter 전송, Shift+Enter 줄바꿈, 📎 파일 첨부 */
export default function Composer({ disabled, disabledReason, onSend }: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | null | undefined) => {
    setError("");
    if (!f) return;
    if (f.size === 0) return setError("빈 파일은 보낼 수 없습니다.");
    if (f.size > MAX_PLAIN_FILE_BYTES) return setError(`파일은 최대 ${formatBytes(MAX_PLAIN_FILE_BYTES)}까지 보낼 수 있습니다.`);
    setFile(f);
  };

  const submit = async () => {
    const body = text.trim();
    if (disabled || sending || (!body && !file)) return;
    setSending(true);
    setError("");
    try {
      await onSend(body, file);
      setText("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div
      className="sm-composer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        pickFile(e.dataTransfer.files?.[0]);
      }}
    >
      {disabled && disabledReason && <p className="sm-muted sm-small">{disabledReason}</p>}
      {file && (
        <div className="sm-chip">
          {file.name} <small>({formatBytes(file.size)})</small>
          <button
            className="sm-chip-x"
            aria-label="첨부 취소"
            onClick={() => {
              setFile(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            ✕
          </button>
        </div>
      )}
      {error && <p className="sm-error">{error}</p>}
      <div className="sm-composer-row">
        <button
          className="sm-icon-btn"
          title="파일 첨부"
          aria-label="파일 첨부"
          disabled={disabled || sending}
          onClick={() => fileRef.current?.click()}
        >
          첨부
        </button>
        <input ref={fileRef} type="file" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
        <textarea
          className="sm-textarea"
          rows={2}
          value={text}
          maxLength={MAX_TEXT_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={disabled ? "" : "메시지 입력 (Enter 전송, Shift+Enter 줄바꿈)"}
          disabled={disabled || sending}
        />
        <button
          className="sm-btn sm-btn--primary"
          onClick={() => void submit()}
          disabled={disabled || sending || (!text.trim() && !file)}
        >
          {sending ? "암호화 중..." : "전송"}
        </button>
      </div>
    </div>
  );
}
