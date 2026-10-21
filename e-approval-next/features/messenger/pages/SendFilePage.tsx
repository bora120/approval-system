"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useAuthState } from "@/lib/auth";
import ContactPicker from "../components/ContactPicker";
import KeyStatus from "../components/KeyStatus";
import { MAX_FILES_PER_SEND, MAX_PLAIN_FILE_BYTES, MAX_RECIPIENTS, MAX_TEXT_LENGTH } from "../constants";
import { sendSecureMessage, useMessengerSession } from "../engine";
import type { Contact } from "../types";
import { formatBytes } from "../utils";

type JobStatus = "waiting" | "encrypting" | "uploading" | "done" | "error" | "canceled";

interface Job {
  key: string;
  receiver: Contact;
  file: File;
  withMemo: boolean; // 받는 사람마다 첫 파일에만 메모를 붙임
  status: JobStatus;
  progress: number; // 0 ~ 1
  error?: string;
}

const STATUS_LABEL: Record<JobStatus, string> = {
  waiting: "대기",
  encrypting: "암호화 중",
  uploading: "전송 중",
  done: "완료",
  error: "실패",
  canceled: "취소됨",
};

/**
 * 파일 전송 화면 (/send)
 * 여러 파일을 여러 사람에게 한 번에 보낸다. 받는 사람마다 따로 암호화되므로
 * 각자 자기 개인키로만 열 수 있다.
 */
export default function SendFilePage() {
  const { user } = useAuthState();
  const session = useMessengerSession(user);

  const [recipients, setRecipients] = useState<Contact[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [memo, setMemo] = useState("");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ------------------------------------------------ 받는 사람
  const addRecipient = (c: Contact) => {
    setNotice("");
    if (recipients.some((r) => r.id === c.id)) return;
    if (!c.hasKey) {
      setNotice(`${c.name}님은 아직 메신저에 접속한 적이 없어 파일을 받을 수 없습니다. 상대가 메신저를 한 번 열어야 해요.`);
      return;
    }
    if (recipients.length >= MAX_RECIPIENTS) {
      setNotice(`받는 사람은 최대 ${MAX_RECIPIENTS}명까지 고를 수 있습니다.`);
      return;
    }
    setRecipients((prev) => [...prev, c]);
  };

  // ------------------------------------------------ 파일
  const addFiles = (list: FileList | null | undefined) => {
    if (!list) return;
    setNotice("");
    const problems: string[] = [];
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES_PER_SEND) {
        problems.push(`파일은 한 번에 최대 ${MAX_FILES_PER_SEND}개까지 보낼 수 있습니다.`);
        break;
      }
      if (f.size === 0) problems.push(`${f.name}: 빈 파일입니다.`);
      else if (f.size > MAX_PLAIN_FILE_BYTES) problems.push(`${f.name}: ${formatBytes(MAX_PLAIN_FILE_BYTES)}를 넘습니다.`);
      else if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setFiles(next);
    if (problems.length) setNotice(problems.join(" "));
    if (fileRef.current) fileRef.current.value = "";
  };

  // ------------------------------------------------ 전송
  const updateJob = (key: string, patch: Partial<Job>) =>
    setJobs((prev) => prev.map((j) => (j.key === key ? { ...j, ...patch } : j)));

  const runJobs = async (targets: Job[]) => {
    if (!user) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);

    // 메모리를 아끼고 서버 부담을 줄이기 위해 한 개씩 순서대로 보냄
    for (const job of targets) {
      if (controller.signal.aborted) {
        updateJob(job.key, { status: "canceled", progress: 0 });
        continue;
      }
      try {
        await sendSecureMessage({
          me: user,
          session,
          partnerId: job.receiver.id,
          text: job.withMemo ? memo.trim() : "",
          file: job.file,
          signal: controller.signal,
          onProgress: (phase, ratio) =>
            updateJob(job.key, { status: phase, progress: phase === "encrypting" ? 0 : ratio }),
        });
        updateJob(job.key, { status: "done", progress: 1, error: undefined });
      } catch (e) {
        const canceled = controller.signal.aborted;
        updateJob(job.key, {
          status: canceled ? "canceled" : "error",
          progress: 0,
          error: canceled ? undefined : e instanceof Error ? e.message : "전송 실패",
        });
      }
    }
    abortRef.current = null;
    setRunning(false);
  };

  const start = () => {
    if (!recipients.length || !files.length) return;
    const created: Job[] = recipients.flatMap((r) =>
      files.map((f, i) => ({
        key: `${r.id}-${i}-${f.name}-${f.size}`,
        receiver: r,
        file: f,
        withMemo: i === 0,
        status: "waiting" as JobStatus,
        progress: 0,
      })),
    );
    setJobs(created);
    void runJobs(created);
  };

  const retryFailed = () => {
    const failed = jobs.filter((j) => j.status === "error" || j.status === "canceled");
    failed.forEach((j) => updateJob(j.key, { status: "waiting", progress: 0, error: undefined }));
    void runJobs(failed);
  };

  const reset = () => {
    setJobs([]);
    setFiles([]);
    setMemo("");
  };

  // ------------------------------------------------ 화면
  if (!user) return <main className="main">불러오는 중...</main>;

  const doneCount = jobs.filter((j) => j.status === "done").length;
  const failCount = jobs.filter((j) => j.status === "error" || j.status === "canceled").length;
  const overall = jobs.length ? jobs.reduce((n, j) => n + (j.status === "done" ? 1 : j.progress), 0) / jobs.length : 0;
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const finished = jobs.length > 0 && !running;
  const ready = session.status === "ready";

  return (
    <main className="sm-page sm-page--narrow">
      <nav className="sm-breadcrumb">
        <Link href="/">홈</Link> › 파일 전송
      </nav>
      <div className="sm-title-row">
        <h1 className="sm-title">파일 전송</h1>
        <Link href="/files" className="sm-btn sm-btn--ghost">
          파일함
        </Link>
      </div>
      <p className="sm-muted sm-lead">
        파일은 내 브라우저에서 AES-256 으로 암호화되어 <strong>받는 사람마다 따로</strong> 전송되고, 받는 사람만 열 수
        있어요. 받은 쪽에서 SHA-256 해시로 위변조 여부를 자동 확인하며, 보관 기간이 지나면 서버에서 자동 삭제됩니다.
      </p>

      <KeyStatus session={session} />
      {notice && <div className="sm-banner sm-banner--warn">{notice}</div>}

      {jobs.length > 0 ? (
        /* ---------------- 전송 진행 / 결과 ---------------- */
        <section className="sm-card">
          <div className="sm-progress-head">
            <h2 className="sm-card-title">
              {running ? "보내는 중..." : failCount ? `완료 ${doneCount}건 · 실패 ${failCount}건` : `${doneCount}건 모두 보냈습니다`}
            </h2>
            <span className="sm-muted">{Math.round(overall * 100)}%</span>
          </div>
          <div className="sm-progress">
            <div className="sm-progress-bar" style={{ width: `${overall * 100}%` }} />
          </div>
          <ul className="sm-jobs">
            {jobs.map((j) => (
              <li key={j.key} className={`sm-job sm-job--${j.status}`}>
                <span className="sm-job-name" title={j.file.name}>
                  {j.file.name}
                </span>
                <span className="sm-job-to">→ {j.receiver.name}</span>
                <span className="sm-job-state">
                  {j.status === "uploading" ? `${Math.round(j.progress * 100)}%` : STATUS_LABEL[j.status]}
                </span>
                {j.error && <span className="sm-job-error">{j.error}</span>}
              </li>
            ))}
          </ul>
          <div className="sm-actions">
            {running && (
              <button className="sm-btn sm-btn--ghost" onClick={() => abortRef.current?.abort()}>
                전송 중단
              </button>
            )}
            {finished && failCount > 0 && (
              <button className="sm-btn sm-btn--ghost" onClick={retryFailed}>
                실패한 것만 다시 보내기
              </button>
            )}
            {finished && (
              <>
                <Link href="/files?box=sent" className="sm-btn sm-btn--ghost">
                  보낸 파일함 보기
                </Link>
                <button className="sm-btn sm-btn--primary" onClick={reset}>
                  새로 보내기
                </button>
              </>
            )}
          </div>
        </section>
      ) : (
        /* ---------------- 전송 준비 ---------------- */
        <>
          <section className="sm-card">
            <h2 className="sm-card-title">
              1. 받는 사람 <small className="sm-muted">({recipients.length}/{MAX_RECIPIENTS})</small>
            </h2>
            {recipients.length > 0 && (
              <div className="sm-chips">
                {recipients.map((r) => (
                  <span key={r.id} className="sm-chip">
                    {r.name} <small>{r.department ?? ""}</small>
                    <button
                      className="sm-chip-x"
                      aria-label={`${r.name} 빼기`}
                      onClick={() => setRecipients((prev) => prev.filter((x) => x.id !== r.id))}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <ContactPicker onSelect={addRecipient} />
          </section>

          <section className="sm-card">
            <h2 className="sm-card-title">
              2. 파일 <small className="sm-muted">({files.length}/{MAX_FILES_PER_SEND})</small>
            </h2>
            <div
              className={`sm-drop ${dragging ? "is-dragging" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
            >
              
              <span>파일을 끌어다 놓거나 클릭해서 선택하세요 (여러 개 가능)</span>
              <small>
                파일당 최대 {formatBytes(MAX_PLAIN_FILE_BYTES)} · 한 번에 {MAX_FILES_PER_SEND}개
              </small>
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            </div>
            {files.length > 0 && (
              <ul className="sm-file-list">
                {files.map((f, i) => (
                  <li key={`${f.name}-${f.size}`}>
                    <span className="sm-file-list-name">{f.name}</span>
                    <small className="sm-muted">{formatBytes(f.size)}</small>
                    <button
                      className="sm-chip-x"
                      aria-label={`${f.name} 빼기`}
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  </li>
                ))}
                <li className="sm-muted sm-small">합계 {formatBytes(totalBytes)}</li>
              </ul>
            )}
          </section>

          <section className="sm-card">
            <h2 className="sm-card-title">3. 전달 내용 (선택)</h2>
            <textarea
              className="sm-textarea sm-textarea--block"
              rows={3}
              maxLength={MAX_TEXT_LENGTH}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="함께 보낼 메시지 (이것도 암호화됩니다)"
            />
          </section>

          <div className="sm-actions">
            <span className="sm-muted sm-small">
              {recipients.length && files.length ? `총 ${recipients.length * files.length}건 전송` : ""}
            </span>
            <button
              className="sm-btn sm-btn--primary sm-btn--large"
              onClick={start}
              disabled={!ready || !recipients.length || !files.length}
            >
              암호화해서 보내기
            </button>
          </div>
        </>
      )}
    </main>
  );
}
