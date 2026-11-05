# 전자결재 시스템 (E-Approval)

Spring Boot 백엔드와 Next.js 프론트엔드를 연결한 전자결재 웹 애플리케이션.
회원가입·로그인·세션 인증과 관리자 승인 기능을 제공하고, 문서 작성 및 결재 관련 화면과 API 포함

### 프로젝트 구성
```
e-approval-integrated/
 ├── backend/          # Spring Boot 4, Java 17 호환 빌드, JPA, Spring Security
 ├── e-approval-next/  # Next.js App Router + TypeScript 프론트엔드 (주 실행 앱)
 ├── frontend/         # (구버전) React + Vite 프론트엔드 – 현재는 e-approval-next 를 사용
 ├── scripts/dev.mjs   # npm run dev 실행기 (환경 점검 + 백엔드·화면 동시 실행)
 ├── DEVELOPMENT.md    # 새 기능을 추가하는 방법 (폴더 구조·규칙)
 ├── package.json      # 최상위 실행 명령 모음
 └── README.md
```

## 가입 규칙
| 직책 | 가입 후 상태 | 로그인 |
|---|---|---|
| 사원 | ACTIVE | 바로 가능 |
| 팀장 / 본부장 / 대표 | PENDING | 관리자 승인 후 가능 |
| 부대표 | 회원가입 불가 | 대표가 조직 관리에서 지정 |
| 대표(최고 관리자) | 회원가입 불가 | 최초 설정(`/setup`)에서 한 번만 생성 |

## 최초 설정 · 조직 관리 (대표 / 부대표 / 관리자)
1. `npm run dev` 로 실행하면 백엔드 터미널에 **초기 설정 토큰**이 출력됩니다.
   (직접 정하려면 실행 전에 PowerShell 에서 `$env:CEO_SETUP_TOKEN="원하는값"`)
2. 브라우저에서 `http://localhost:3000/setup` 을 열고 토큰과 대표 정보를 입력 → **대표(최고 관리자)** 계정 생성
   - 대표가 만들어지면 `/setup` 은 자동으로 닫힙니다. 토큰을 10번 틀리면 10분간 잠깁니다.
3. 대표로 로그인 → 상단 **조직 관리**(`/admin`)

| 할 수 있는 일 | 관리자 | 대표 |
|---|---|---|
| 가입 승인 / 거절 | ✅ | ✅ |
| 직책 변경 (사원·팀장·본부장) | ✅ | ✅ |
| **부대표 지정 / 해제** | ❌ | ✅ |
| **관리자 권한 부여 / 회수** | ❌ | ✅ |
| 대표 계정 변경, 자기 자신의 직책·권한 변경 | ❌ | ❌ |

> 예전 버전에서 자동으로 만들던 `admin / admin1234!` 기본 계정은 보안상 더 이상 만들지 않습니다.
> (이미 만들어진 DB 에서는 그대로 로그인할 수 있습니다)

## VS Code 준비물
- JDK 17 이상 (Spring Boot 4.1 + Gradle 9.8 → JDK 26까지 지원)
- Node.js 20.9 이상
- 확장: **Extension Pack for Java**, **Spring Boot Extension Pack**

## DB 설정 (Supabase) — 처음 한 번
DB는 팀 공용 Supabase(PostgreSQL)를 사용합니다. 접속 정보는 GitHub에 올리지 않고 각자 PC에만 둡니다.
1. `backend/.env.example` 을 복사해 같은 폴더에 `backend/.env` 로 저장
2. Supabase 대시보드 → **Connect** → **Session pooler** 의 host / user, 그리고 DB 비밀번호를 `.env` 에 입력
3. (프로젝트 최초 1회, 한 사람만) Supabase **SQL Editor** 에서 `create schema if not exists app;` 실행

테이블은 서버를 켤 때 자동으로 `app` 스키마에 만들어집니다 (`ddl-auto: update`).
4. `backend/.env` 에 `CA_KEY_PASSWORD` (전자서명용 사내 인증기관 비밀번호, 12자 이상)를 추가 — **팀원 모두 같은 값**

## 전자서명 (PKI 인증서 기반 결재)
결재 = 결재자의 전자서명을 문서에 차례로 추가하는 것. 상신·승인·반려는 모두 **X.509 인증서 전자서명**으로만 처리됩니다.
자세한 설계(ERD·흐름도·서명 형식·검증 항목)는 [`docs/e-signature-design.md`](docs/e-signature-design.md) 참고.

| 구성 | 내용 |
|---|---|
| 사내 인증기관(CA) | 서버가 처음 켜질 때 루트 인증서(ECDSA P-256) 생성 → `pki_ca` 테이블에 저장. CA 개인키는 `CA_KEY_PASSWORD` 로 암호화(PBKDF2 + AES-256-GCM) |
| 인증서 발급 (`/certificate`) | 브라우저가 키쌍 생성 → 개인키는 **인증서 암호**로 암호화해 브라우저(IndexedDB)에만 저장 → 공개키 + 개인키 소유 증명(서명) + 로그인 비밀번호(본인 확인)로 요청 → CA 가 X.509 v3 인증서 발급 |
| 기안자 서명 (상신) | "전자서명 후 상신" → 임시저장 후 인증서 암호 입력 → 문서 내용 해시에 서명 → 서명 사슬의 첫 고리 |
| 결재자 서명 (승인/반려) | 문서 해시 + 결재 의견 + **바로 앞 서명의 해시**에 서명 → 기안 ← 1차 ← 2차… **서명 사슬** |
| 자동 검증 | 결재할 때(앞 서명이 깨져 있으면 결재 차단), 문서를 열 때, 30분마다 주기 감사로 서명 사슬 전체를 다시 검증 → 문서의 `integrity`(서명 유효/검증 실패)에 기록, 목록·상세에 배지로 표시 |

- 코드: `backend/.../pki/` (CA·인증서), `document/service/DocumentSignatureService.java` (서명 원문·검증), `e-approval-next/features/pki/` (브라우저 키·서명)
- 외부 라이브러리 없이 JDK 표준 API + 브라우저 Web Crypto API 만 사용 (X.509 인코딩은 `pki/crypto/Der.java` 직접 구현)
- 내려받은 `.crt` 는 윈도우에서 더블클릭하거나 `openssl x509 -in user.crt -text` 로 확인할 수 있습니다.

## 실행 (명령어 하나)
**프로젝트 최상위 폴더**(backend, e-approval-next 가 보이는 곳)에서:
```bash
npm run dev
```
- 필요한 프로그램(Node, Java)을 확인하고, 프론트 패키지가 없으면 자동으로 설치합니다.
- 백엔드를 켜고 **실제로 응답할 때까지 기다린 뒤** 화면(Next.js)을 켭니다.
- `✔ 준비 완료!` 가 뜨면 안내된 주소(기본 http://localhost:3000)로 접속하세요.
- 종료: 터미널에서 `Ctrl + C` (백엔드·화면 함께 종료)
- VS Code 메뉴 **터미널 → 작업 실행 → "전자결재: 전체 실행"** 으로도 실행할 수 있습니다.

| 명령 | 설명 |
|---|---|
| `npm run dev` | 백엔드 + 화면 함께 실행 |
| `npm run dev:back` | 백엔드만 |
| `npm run dev:front` | 화면만 (백엔드는 따로 켠 경우) |
| `npm run setup` | 프로그램 확인 + 패키지 설치만 |

### 실행이 안 될 때
| 메시지 | 해결 |
|---|---|
| `Java(JDK)를 찾을 수 없습니다` | `winget install EclipseAdoptium.Temurin.21.JDK` → VS Code 재시작 |
| `8080 포트를 다른 프로그램이 사용 중입니다` | 이전에 켠 서버를 종료 (`Get-NetTCPConnection -LocalPort 8080` 으로 확인) |
| `백엔드가 종료되었습니다` | `[백엔드]` 로그의 `ERROR` / `Caused by` 줄 확인 |
| 화면의 "백엔드 서버에 연결할 수 없습니다" | 백엔드가 꺼져 있음 → `npm run dev` 로 다시 실행 |
| `npm error enoent Could not read package.json` | 최상위 폴더가 아닌 곳에서 실행함 → backend 와 e-approval-next 가 보이는 폴더로 이동 |

## API
| Method | URL | 권한 | 설명 |
|---|---|---|---|
| POST | /api/auth/signup | 누구나 | 회원가입 |
| POST | /api/auth/login | 누구나 | 로그인 (세션 쿠키 발급) |
| POST | /api/auth/logout | 로그인 | 로그아웃 |
| GET | /api/auth/me | 로그인 | 내 정보 |
| GET | /api/admin/users?status=PENDING | ADMIN | 승인 대기 목록 |
| PATCH | /api/admin/users/{id}/approve | ADMIN | 가입 승인 |
| PATCH | /api/admin/users/{id}/reject | ADMIN | 가입 거절 |
| GET | /api/setup/status | 누구나 | 최초 대표 등록 가능 여부 |
| POST | /api/setup/ceo | 누구나(토큰 필요) | 최초 대표 등록 |
| GET | /api/admin/users/all | ADMIN | 전체 직원 |
| PATCH | /api/admin/users/{id}/position | ADMIN (부대표는 대표만) | 직책 변경 |
| PATCH | /api/admin/users/{id}/role | 대표 | 관리자 권한 부여/회수 |
| GET | /api/documents?status= | 로그인 | 내가 작성한 문서 |
| GET | /api/documents/inbox | 로그인 | 내가 결재할 차례인 문서 |
| GET | /api/documents/decided | 로그인 | 내가 승인·반려한 문서 (최근 100건) |
| POST | /api/documents/{id}/approve | 결재 차례인 사람 | 승인 (`{"comment": "선택"}`) → 다음 결재자로, 마지막이면 승인완료 |
| POST | /api/documents/{id}/reject | 결재 차례인 사람 | 반려 (`{"comment": "필수, 500자 이하"}`) |
| POST | /api/documents/{id}/copy | 작성자 (반려 문서) | 내용·결재선을 복사한 새 임시저장 문서 생성 |
| POST | /api/documents/{id}/withdraw | 작성자 | 첫 결재 전이면 회수 |

## 디자인
- 흑백 미니멀. 색은 `app/globals.css` 맨 위 `:root` 토큰(검정·흰색·회색)만 사용하고, 기능별 CSS(`apv-`, `sm-`, `org-`)도 이 토큰을 씁니다.
- 기본 글자 13px, 보조 11–12px. 강조는 색 대신 굵기·선·반전(검정 배경)으로 표현합니다.
- 상태 뱃지: 임시저장(점선) · 진행중(테두리) · 승인완료(검정) · 반려(회색)

## 화면 개발 참고 (e-approval-next)
- 로그인 정보: `const { user, loading } = useAuthState()` (`@/lib/auth`) → `user.name`, `user.positionLabel`, `user.role`
- 로그인이 필요한 페이지는 내용을 `<RequireAuth>...</RequireAuth>` 로 감싸면 로그인 안 한 사용자는 `/auth` 로 이동합니다.
- API 호출은 `api()` (`@/lib/api-client`) 를 사용하세요. 세션 쿠키와 에러 메시지를 자동 처리합니다.

## 메신저 · 파일 전송 (종단간 암호화)
기존 `secure-messenger` 프로젝트의 암호화 설계를 이 시스템에 통합했습니다. 전자결재 계정으로 그대로 사용합니다.

| 화면 | 주소 |
|---|---|
| 메신저 (1:1 채팅 + 파일 첨부) | `/messenger` , 특정 상대: `/messenger?with=사용자ID` |
| 파일 전송 (여러 파일 × 여러 명, 진행률, 중단/재시도) | `/send` |
| 파일함 (받은/보낸 파일, 수신 확인, 전송 취소·삭제) | `/files` , 보낸 파일: `/files?box=sent` |

**암호화 구조**
- 사용자마다 RSA 키쌍 2개: 암호화용 RSA-OAEP 2048, 서명용 RSA-PSS 2048 (메신저 첫 접속 때 브라우저에서 자동 생성)
- 개인키는 **추출 불가(non-extractable)** 상태로 브라우저 IndexedDB 에만 저장, 서버로 절대 전송하지 않음
- 메시지·파일마다 1회용 AES-256-GCM 키로 암호화 → AES 키를 받는 사람과 나의 공개키로 각각 감쌈 (보낸 메시지도 내가 다시 읽을 수 있음)
- `v1|보낸사람ID|받는사람ID|본문` 에 RSA-PSS 전자서명 → 각 메시지에 ✔ 서명확인 / ✖ 서명실패 표시
- 메시지 UUID 를 서명에 포함하고 서버가 중복 저장을 막아 **재전송(replay) 공격 차단**
- 파일은 원본 SHA-256 해시를 서명된 본문에 담아, 받은 뒤 복호화 + 해시 비교로 **위변조 자동 확인**
- **안전번호**: 두 사람이 서로의 공개키 지문을 직접 비교해 서버의 키 바꿔치기(중간자 공격)를 확인
- 서버(관리자 포함)는 암호문과 "누가 누구에게 언제" 보냈는지만 알 수 있음

**파일 전송 규칙**
- 파일당 최대 20MB, 한 번에 파일 10개 · 받는 사람 10명까지 (받는 사람마다 따로 암호화)
- 받는 사람이 처음 내려받으면 보낸 사람 화면에 "✓ 상대가 받음" 표시 (수신 확인)
- 보낸 사람은 "전송 취소", 받는 사람은 "삭제" 가능 → 서버의 암호문 파일이 지워지고 기록만 남음
- 보관 기간(기본 7일, `application.yml` 의 `app.messenger.file-retention-days`)이 지나면 서버가 1시간마다 자동 삭제

**알아둘 점**
- 개인키는 브라우저에 있으므로 다른 PC·브라우저에서는 예전 메시지를 열 수 없습니다. (새 키를 만들면 이후 메시지는 정상)
- Web Crypto 는 `localhost` 또는 `https` 에서만 동작합니다. 같은 와이파이의 다른 PC에서 `http://192.168...` 으로 접속하면 메신저가 동작하지 않습니다.
- 새 메시지는 3초마다 확인합니다(폴링). 사용자가 많아지면 WebSocket 으로 바꾸는 것을 권장합니다.

| Method | URL | 설명 |
|---|---|---|
| GET / POST | /api/messenger/keys/me , /api/messenger/keys | 내 공개키 조회 / 등록 |
| GET | /api/messenger/contacts?keyword= | 대화 상대 검색 |
| GET | /api/messenger/contacts/{id}/key | 상대 공개키 |
| GET | /api/messenger/conversations | 대화 목록 |
| GET | /api/messenger/conversations/{id}/messages?afterId=&beforeId= | 메시지 (암호문) |
| POST | /api/messenger/conversations/{id}/read | 읽음 처리 |
| GET | /api/messenger/unread-count | 안 읽은 메시지 수 |
| POST | /api/messenger/messages | 전송 (multipart: data, file) |
| GET | /api/messenger/messages/{id}/file | 암호화된 첨부파일 (받는 사람이면 수신 확인 기록, 삭제·만료 시 410) |
| DELETE | /api/messenger/messages/{id}/file | 첨부파일 삭제 (보낸 사람: 전송 취소) |
| GET | /api/messenger/files?box=received\|sent&beforeId= | 파일함 |

## 보안 처리
- 비밀번호 BCrypt 해시 저장
- 회원가입으로 ADMIN 권한 획득 불가, 팀장 이상은 관리자 승인 필요
- 로그인 실패 시 아이디/비밀번호 중 무엇이 틀렸는지 구분하지 않음
- 승인 대기 여부는 비밀번호가 맞은 뒤에만 알려줌 (아이디 존재 여부 노출 방지)
- 로그인 시 세션 ID 재발급 (세션 고정 공격 방지)
- 세션 쿠키 HttpOnly + SameSite=Lax

## TODO
- [ ] 배포 전 CSRF 토큰 활성화 (`SecurityConfig` 주석 참고)
- [ ] 로그인 실패 횟수 제한
- [x] DB를 Supabase(PostgreSQL)로 전환 (`backend/.env.example` 참고)
- [x] 결재 승인·반려를 PKI 인증서 전자서명으로 변경
- [ ] 기안자도 상신할 때 전자서명 (지금은 결재자만 서명)
- [x] 기본 관리자 계정 제거 → 최초 대표 등록 방식으로 변경
- [x] 결재 승인·반려·다시 작성

# e-approval-integrated
