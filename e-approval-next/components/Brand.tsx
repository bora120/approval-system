/**
 * 서비스 로고 — "nano" 는 크게, "system" 은 작게.
 * 글꼴: Cafe24 PRO Slim Fit 을 굵게 + 세로로 늘려서(scaleY) 좁고 긴 느낌을 낸다.
 * size: header(상단 바) / hero(홈·로그인 큰 제목)
 */
export default function Brand({ size = "header" }: { size?: "header" | "hero" }) {
  return (
    <span className={`brand brand--${size}`} aria-label="nano system">
      <span className="brand-nano" aria-hidden="true">nano</span>
      <span className="brand-system" aria-hidden="true">system</span>
    </span>
  );
}
