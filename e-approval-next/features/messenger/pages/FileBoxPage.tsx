"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthState } from "@/lib/auth";
import { messengerApi } from "../api";
import KeyStatus from "../components/KeyStatus";
import { decryptAll, useMessengerSession } from "../engine";
import { fileStatusText, saveSecureFile } from "../files";
import { fileStateOf, type DecryptedMessage, type EncryptedMessage, type FileItem } from "../types";
import { formatBytes, formatShortTime } from "../utils";

type Box = "received" | "sent";

interface Row {
  item: FileItem;
  dec: DecryptedMessage;
}

/** 파일함 (/files?box=received|sent): 주고받은 암호화 파일 모아 보기 */
export default function FileBoxPage() {
  const { user } = useAuthState();
  const session = useMessengerSession(user);
  const router = useRouter();
  const searchParams = useSearchParams();
  const box: Box = searchParams.get("box") === "sent" ? "sent" : "received";

  const [rows, setRows] = useState<Row[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<Record<number, string>>({});

  const ring = session.ring;
  const userId = user?.id ?? null;

  const load = useCallback(
    async (beforeId?: number) => {
      if (!ring || !userId) return;
      setLoading(true);
      setError("");
      try {
        const page = await messengerApi.files(box, beforeId);
        const decrypted = await decryptAll(
          page.items.map((i) => i.message),
          page.keys,
          userId,
          ring,
        );
        const next = page.items.map((item, i) => ({ item, dec: decrypted[i] }));
        setRows((prev) => (beforeId ? [...prev, ...next] : next));
        setHasMore(page.hasMore);
      } catch (e) {
        setError(e instanceof Error ? e.message : "파일함을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [box, ring, userId],
  );

  useEffect(() => {
    setRows([]);
    void load();
  }, [load]);

  const updateRow = (raw: EncryptedMessage) =>
    setRows((prev) =>
      prev.map((r) =>
        r.item.message.id === raw.id
          ? { item: { ...r.item, message: raw }, dec: { ...r.dec, raw: { ...r.dec.raw, ...raw } } }
          : r,
      ),
    );

  const save = async (row: Row) => {
    const id = row.item.message.id;
    setBusyId(id);
    setRowError((p) => ({ ...p, [id]: "" }));
    try {
      const ok = await saveSecureFile(row.dec);
      if (!ok) setRowError((p) => ({ ...p, [id]: "삭제되었거나 보관 기간이 지난 파일입니다." }));
      else if (!row.item.mine && !row.item.message.fileDownloadedAt) {
        updateRow({ ...row.item.message, fileDownloadedAt: new Date().toISOString() });
      }
    } catch (e) {
      setRowError((p) => ({ ...p, [id]: e instanceof Error ? e.message : "파일을 열 수 없습니다." }));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: Row) => {
    const id = row.item.message.id;
    const msg = row.item.mine
      ? "이 파일의 전송을 취소할까요? 상대방도 더 이상 내려받을 수 없게 됩니다."
      : "이 파일을 삭제할까요? 보낸 사람도 더 이상 내려받을 수 없게 됩니다.";
    if (!window.confirm(msg)) return;
    setBusyId(id);
    try {
      updateRow(await messengerApi.deleteFile(id));
    } catch (e) {
      setRowError((p) => ({ ...p, [id]: e instanceof Error ? e.message : "삭제하지 못했습니다." }));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return rows;
    return rows.filter(
      (r) =>
        (r.dec.payload?.file?.name ?? "").toLowerCase().includes(k) ||
        r.item.partner.name.toLowerCase().includes(k) ||
        (r.dec.payload?.text ?? "").toLowerCase().includes(k),
    );
  }, [rows, keyword]);

  if (!user) return <main className="main">불러오는 중...</main>;

  const tab = (b: Box, label: string) => (
    <button
      role="tab"
      aria-selected={box === b}
      className={`sm-tab ${box === b ? "is-active" : ""}`}
      onClick={() => router.replace(b === "received" ? "/files" : "/files?box=sent")}
    >
      {label}
    </button>
  );

  return (
    <main className="sm-page">
      <nav className="sm-breadcrumb">
        <Link href="/">홈</Link> › 파일함
      </nav>
      <div className="sm-title-row">
        <h1 className="sm-title">파일함</h1>
        <Link href="/send" className="sm-btn sm-btn--primary">
          파일 보내기
        </Link>
      </div>

      <KeyStatus session={session} />

      <div className="sm-toolbar">
        <div className="sm-tabs" role="tablist">
          {tab("received", "받은 파일")}
          {tab("sent", "보낸 파일")}
        </div>
        <input
          className="sm-input sm-search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="파일 이름, 사람, 내용 검색"
        />
      </div>

      {error && <div className="sm-banner sm-banner--error">{error}</div>}

      <section className="sm-card sm-card--flush">
        {loading && rows.length === 0 ? (
          <p className="sm-muted sm-pad">파일을 복호화하는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="sm-muted sm-pad sm-center">
            {keyword ? "검색 결과가 없습니다." : box === "received" ? "받은 파일이 없습니다." : "보낸 파일이 없습니다."}
          </p>
        ) : (
          <ul className="sm-filebox">
            {filtered.map((row) => {
              const m = row.item.message;
              const state = fileStateOf(m);
              const gone = state === "deleted" || state === "expired";
              const meta = row.dec.payload?.file;
              return (
                <li key={m.id} className={`sm-filebox-row ${gone ? "is-gone" : ""}`}>
                  <span className="sm-filebox-icon">{row.dec.error ? "LOCK" : gone ? "—" : "FILE"}</span>
                  <div className="sm-filebox-main">
                    <strong className="sm-filebox-name" title={meta?.name}>
                      {row.dec.error ? "열 수 없는 파일" : (meta?.name ?? "(파일 정보 없음)")}
                    </strong>
                    <small className="sm-muted">
                      {row.item.mine ? "받는 사람" : "보낸 사람"}: {row.item.partner.name} ·{" "}
                      {meta ? formatBytes(meta.size) : formatBytes(m.fileCipherSize)} · {formatShortTime(m.createdAt)}
                    </small>
                    {row.dec.payload?.text && <small className="sm-filebox-memo">{row.dec.payload.text}</small>}
                    <small className={`sm-filebox-status sm-filebox-status--${state}`}>
                      {row.dec.error ?? fileStatusText(m, row.item.mine)}
                    </small>
                    {rowError[m.id] && <small className="sm-error">{rowError[m.id]}</small>}
                  </div>
                  <div className="sm-filebox-side">
                    {!row.dec.error && (
                      <span className={row.dec.verified ? "sm-verified" : "sm-unverified"}>
                        {row.dec.verified ? "서명 확인" : "서명 실패"}
                      </span>
                    )}
                    <div className="sm-filebox-actions">
                      {!gone && !row.dec.error && (
                        <button className="sm-btn sm-btn--small sm-btn--ghost" onClick={() => save(row)} disabled={busyId === m.id}>
                          {busyId === m.id ? "처리 중..." : "저장"}
                        </button>
                      )}
                      {!gone && (
                        <button className="sm-btn sm-btn--small sm-btn--ghost" onClick={() => remove(row)} disabled={busyId === m.id}>
                          {row.item.mine ? "전송 취소" : "삭제"}
                        </button>
                      )}
                      <Link href={`/messenger?with=${row.item.partner.id}`} className="sm-btn sm-btn--small sm-btn--ghost">
                        대화
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {hasMore && (
        <div className="sm-center">
          <button
            className="sm-btn sm-btn--ghost"
            disabled={loading}
            onClick={() => void load(rows[rows.length - 1]?.item.message.id)}
          >
            {loading ? "불러오는 중..." : "더 보기"}
          </button>
        </div>
      )}
    </main>
  );
}
