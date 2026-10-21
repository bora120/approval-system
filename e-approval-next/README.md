# 전자결재 시스템 (Next.js)

기존 HTML/CSS/JS 프로젝트를 Next.js(App Router, TypeScript)로 변환한 버전입니다.

## 실행

```bash
npm install
npm run dev     # http://localhost:3000
```

테스트 로그인: `test@test.com` / `1234`

## 구조

| 원본 | Next.js |
| --- | --- |
| index.html | app/page.tsx |
| auth.html | app/auth/page.tsx |
| send.html | app/send/page.tsx |
| documents.html | app/documents/page.tsx |
| approval.html | app/approval/page.tsx |
| mypage.html | app/mypage/page.tsx |
| css/style.css | app/globals.css (원본 그대로) |
| js/script.js | lib/auth.ts + components/* |
