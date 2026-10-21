"use client";

import { useState } from "react";
import { messengerApi } from "../api";
import { fileStatusText, saveSecureFile } from "../files";
import { fileStateOf, type DecryptedMessage, type EncryptedMessage } from "../types";
import { formatBytes, formatTime } from "../utils";

interface Props {
  message: DecryptedMessage;
  showRead: boolean;
  /** 삭제·다운로드 등으로 서버 상태가 바뀌었을 때 */
  onUpdate?: (raw: EncryptedMessage) => void;
}

export default function MessageBubble({ message, showRead, onUpdate }: Props) {
  const { raw, mine, payload, verified, error } = message;
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [fileError, setFileError] = useState("");

  const state = fileStateOf(raw);
  const gone = state === "deleted" || state === "expired";

  const save = async () => {
    setBusy("save");
    setFileError("");
    try {
      const ok = await saveSecureFile(message);
      if (!ok) setFileError("삭제되었거나 보관 기간이 지난 파일입니다.");
      else if (!mine && !raw.fileDownloadedAt) onUpdate?.({ ...raw, fileDownloadedAt: new Date().toISOString() });
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "파일을 열 수 없습니다.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const msg = mine
      ? "이 파일의 전송을 취소할까요?\n상대방도 더 이상 내려받을 수 없게 됩니다."
      : "이 파일을 삭제할까요?\n보낸 사람도 더 이상 내려받을 수 없게 됩니다.";
    if (!window.confirm(msg)) return;
    setBusy("delete");
    setFileError("");
    try {
      onUpdate?.(await messengerApi.deleteFile(raw.id));
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`sm-row ${mine ? "sm-row--mine" : ""}`}>
      <div className={`sm-bubble ${mine ? "sm-bubble--mine" : ""} ${error ? "sm-bubble--locked" : ""}`}>
        {error ? (
          <span>{error}</span>
        ) : (
          <>
            {payload?.text && <p className="sm-text">{payload.text}</p>}
            {payload?.file && (
              <div className={`sm-file ${gone ? "is-gone" : ""}`}>
                <span className="sm-file-icon">{gone ? "—" : "FILE"}</span>
                <span className="sm-file-info">
                  <strong title={payload.file.name}>{payload.file.name}</strong>
                  <small>
                    {formatBytes(payload.file.size)} · {fileStatusText(raw, mine)}
                  </small>
                </span>
                {!gone && (
                  <span className="sm-file-actions">
                    <button className="sm-btn sm-btn--small" onClick={save} disabled={!!busy}>
                      {busy === "save" ? "복호화 중..." : "저장"}
                    </button>
                    <button
                      className="sm-btn sm-btn--small"
                      onClick={remove}
                      disabled={!!busy}
                      title={mine ? "전송 취소" : "삭제"}
                    >
                      {mine ? "취소" : "삭제"}
                    </button>
                  </span>
                )}
              </div>
            )}
            {fileError && <p className="sm-error">{fileError}</p>}
          </>
        )}
      </div>
      <div className="sm-meta">
        {!error && (
          <span
            className={verified ? "sm-verified" : "sm-unverified"}
            title={verified ? "보낸 사람의 전자서명이 확인되었습니다." : "서명을 확인할 수 없습니다. 변조되었을 수 있어요."}
          >
            {verified ? "서명 확인" : "서명 실패"}
          </span>
        )}
        {mine && showRead && <span className="sm-read">읽음</span>}
        <span>{formatTime(raw.createdAt)}</span>
      </div>
    </div>
  );
}
