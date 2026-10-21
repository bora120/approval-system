"use client";

import { formatFingerprint } from "../crypto";

interface Props {
  myFingerprint: string | null;
  partnerName: string;
  partnerFingerprint: string | null;
  onClose: () => void;
}

/**
 * 안전번호 비교 화면.
 * 두 사람이 직접 만나거나 전화로 번호를 비교해 같으면, 서버가 중간에서 키를 바꿔치기(중간자 공격)하지 않았다는 뜻.
 */
export default function SafetyNumber({ myFingerprint, partnerName, partnerFingerprint, onClose }: Props) {
  return (
    <div className="sm-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sm-modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>안전번호 확인</h3>
        <p className="sm-muted">
          {partnerName}님과 서로의 번호를 직접(대면·전화) 비교하세요. 상대 화면의 &quot;내 번호&quot;가 여기의 &quot;
          {partnerName}님 번호&quot;와 같으면 대화가 안전하게 암호화되고 있다는 뜻입니다.
        </p>
        <dl className="sm-fp">
          <dt>내 번호</dt>
          <dd>{formatFingerprint(myFingerprint)}</dd>
          <dt>{partnerName}님 번호</dt>
          <dd>{formatFingerprint(partnerFingerprint)}</dd>
        </dl>
        <button className="sm-btn sm-btn--primary" onClick={onClose}>
          확인
        </button>
      </div>
    </div>
  );
}
