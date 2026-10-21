"use client";

import type { MessengerSession } from "../engine";

/** 보안 키 상태 안내 (준비 중 / 지원 안 됨 / 이 브라우저에 키 없음 / 오류) */
export default function KeyStatus({ session }: { session: MessengerSession }) {
  const { status, error, regenerate } = session;

  if (status === "ready") return null;

  if (status === "checking") {
    return <div className="sm-banner">보안 키를 준비하고 있어요...</div>;
  }

  if (status === "unsupported") {
    return (
      <div className="sm-banner sm-banner--warn">
        이 주소에서는 브라우저 암호화 기능을 쓸 수 없습니다. <strong>http://localhost:3000</strong> 으로 접속하거나
        https 주소를 사용하세요. (Web Crypto 는 보안 연결에서만 동작합니다)
      </div>
    );
  }

  if (status === "missing-local") {
    return (
      <div className="sm-banner sm-banner--warn">
        <p>
          <strong>이 브라우저에는 내 개인키가 없습니다.</strong> 다른 PC·브라우저에서 메신저를 처음 사용했거나 브라우저
          데이터를 지운 경우입니다.
        </p>
        <p>
          새 키를 만들면 바로 메시지를 주고받을 수 있지만, <strong>예전 메시지는 이 브라우저에서 열 수 없습니다.</strong>{" "}
          (예전 키가 있는 브라우저에서는 계속 열 수 있어요)
        </p>
        <button className="sm-btn sm-btn--primary" onClick={() => void regenerate()}>
          이 브라우저용 새 키 만들기
        </button>
      </div>
    );
  }

  if (status === "outdated-local") {
    return (
      <div className="sm-banner sm-banner--warn">
        <p>
          <strong>다른 브라우저에서 새 보안 키를 만들어, 이 브라우저의 키는 예전 키가 되었습니다.</strong> 이 브라우저에서
          주고받았던 예전 메시지는 계속 읽을 수 있지만, 새 메시지를 보내거나 받으려면 키를 새로 만들어야 합니다.
        </p>
        <p>
          여기서 새 키를 만들면 이번엔 <strong>다른 브라우저의 키가 예전 키</strong>가 됩니다. (한 번에 하나의 브라우저만
          최신 키를 가집니다)
        </p>
        <button className="sm-btn sm-btn--primary" onClick={() => void regenerate()}>
          이 브라우저용 새 키 만들기
        </button>
      </div>
    );
  }

  return (
    <div className="sm-banner sm-banner--error">
      {error || "메신저를 준비하지 못했습니다."}
      <button className="sm-btn sm-btn--ghost" onClick={() => window.location.reload()}>
        다시 시도
      </button>
    </div>
  );
}
