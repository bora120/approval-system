# 인증서 기반 전자서명 결재 — 설계서

> 전자결재 시스템 캡스톤 프로젝트 · 결재 = 결재자의 전자서명을 문서에 차례로 추가하는 것

## 1. 설계 목표

| 요구사항 | 설계 |
|---|---|
| 인증서 기반 전자서명으로 결재 | 상신·승인·반려 모두 X.509 인증서(ECDSA P-256)의 개인키로 서명해야만 처리된다. 서명이 없거나 검증에 실패하면 서버가 거부한다. |
| 인증기관(CA) 구축 | 사내 루트 CA를 두고, 본인 확인과 개인키 소유 증명을 거쳐 사용자에게 X.509 v3 인증서를 발급한다. |
| 결재 = 전자서명 추가 | **기안자 서명 → 1차 결재자 서명 → 2차 …** 순서로 서명이 쌓인다. 각 서명은 바로 앞 서명의 해시를 포함하는 **서명 사슬**이다. |
| 전자서명값 관리 필드 | 문서(기안자 서명)와 결재선(결재자 서명)에 인증서·서명 원문·서명값 필드를 두고, 인증서·CA 테이블을 추가한다. |
| 문서 유효성 = 서명 검증, 자동 처리 | 결재할 때, 문서를 열 때, 30분마다 주기 감사할 때 서명 사슬 전체를 자동으로 다시 검증하고 결과를 문서의 무결성 필드에 기록한다. |

## 2. 전체 구조

```mermaid
flowchart LR
  subgraph Browser["브라우저 (Next.js)"]
    K["개인키 암호문<br/>IndexedDB<br/>인증서 암호로 암호화"]
    U["인증 세션<br/>추출 불가 서명 키<br/>30분 미사용 잠금"]
    S["서명 모듈<br/>Web Crypto ECDSA"]
  end
  subgraph Server["백엔드 (Spring Boot)"]
    CA["사내 인증기관<br/>CaService"]
    CS["인증서 발급<br/>CertificateService"]
    DS["결재·서명 검증<br/>DocumentService<br/>DocumentSignatureService"]
    AJ["주기 감사<br/>SignatureAuditJob"]
  end
  DB[("Supabase PostgreSQL<br/>app 스키마")]

  K -- "인증서 암호로 1회 해제" --> U
  U --> S
  K <-->|"같은 암호문 보관·복원"| CS
  S -- "공개키 + 소유 증명" --> CS
  CS --> CA
  S -- "서명값" --> DS
  DS --> DB
  CS --> DB
  CA --> DB
  AJ --> DS
```

- **인증서는 공개, 개인키는 암호문으로만 보관한다.** 인증서(공개키)는 공개 문서라 DB 에 그대로 두고 누구나 조회한다.
  개인키는 브라우저에서 만들고 인증서 암호(PBKDF2 60만 회 + AES-256-GCM)로 암호화한 **암호문**을 IndexedDB 와 DB 에 함께 보관한다.
- **평문 개인키와 인증서 암호는 서버로 가지 않는다.** 그래서 서버·DB 관리자는 암호문을 갖고 있어도 결재자 서명을 만들어 낼 수 없다.
- 서버는 공개키(인증서)로 **검증만** 한다.

## 3. 데이터 모델 (ERD)

```mermaid
erDiagram
  users ||--o{ user_certificates : "발급받음"
  users ||--o{ approval_documents : "기안"
  users ||--o{ approval_lines : "결재"
  approval_documents ||--|{ approval_lines : "결재선"
  approval_documents ||--o{ attachments : "첨부"
  user_certificates |o--o{ approval_documents : "기안 서명에 사용"
  user_certificates |o--o{ approval_lines : "결재 서명에 사용"

  pki_ca {
    bigint id PK
    varchar name UK "ROOT"
    varchar certificate_pem "루트 인증서"
    varchar encrypted_private_key "AES-GCM(PKCS8)"
    varchar key_salt
    varchar key_iv
    int kdf_iterations
  }
  user_certificates {
    bigint id PK
    bigint user_id FK
    varchar serial_number UK
    varchar subject_dn
    varchar certificate_pem "X.509 v3"
    timestamp not_before
    timestamp not_after
    varchar status "VALID / REVOKED"
    timestamp revoked_at
    varchar encrypted_private_key "AES-GCM(PKCS8) 암호문"
    varchar private_key_public_key "암호문 짝 공개키"
    varchar private_key_salt
    varchar private_key_iv
    int private_key_iterations "PBKDF2 60만 회 이상"
  }
  approval_documents {
    bigint id PK
    varchar doc_number UK
    bigint writer_id FK
    varchar status
    bigint writer_certificate_id FK "기안자 서명 인증서"
    varchar writer_signed_message "기안 서명 원문"
    varchar writer_signature_value "기안 서명값"
    varchar integrity "DRAFT/VALID/INVALID/LEGACY"
    varchar integrity_detail "실패 사유"
    timestamp integrity_checked_at
  }
  approval_lines {
    bigint id PK
    bigint document_id FK
    bigint approver_id FK
    int step_order
    varchar status
    varchar comment
    timestamp acted_at
    bigint certificate_id FK "결재 서명 인증서"
    varchar signed_message "결재 서명 원문"
    varchar signature_value "결재 서명값"
  }
  attachments {
    bigint id PK
    bigint document_id FK
    varchar sha256 "파일 해시 → 문서 해시에 포함"
  }
```

**추가된 전자서명 필드**

| 테이블 | 필드 | 의미 |
|---|---|---|
| `approval_documents` | `writer_certificate_id`, `writer_signed_message`, `writer_signature_value` | 기안자 서명 (사슬의 첫 고리) |
| `approval_documents` | `integrity`, `integrity_detail`, `integrity_checked_at` | 서명 사슬 자동 검증 결과 |
| `approval_lines` | `certificate_id`, `signed_message`, `signature_value` | 결재자 서명 |
| `user_certificates` | (테이블 신설) | 사용자 인증서와 폐기 상태 |
| `user_certificates` | `encrypted_private_key`, `private_key_public_key`, `private_key_salt`, `private_key_iv`, `private_key_iterations` | 인증서 암호로 암호화한 개인키 (다른 PC 복원용). 마이그레이션: `docs/approval-pki-backup-migration.sql` |
| `pki_ca` | (테이블 신설) | 루트 CA 인증서와 암호화된 CA 개인키 |

## 4. 인증기관(CA)과 인증서

| 항목 | 값 |
|---|---|
| 알고리즘 | ECDSA P-256 / SHA-256 (`ecdsa-with-SHA256`) |
| 루트 CA | `CN=E-Approval Root CA, O=E-Approval, C=KR`, 10년, `basicConstraints CA:TRUE pathlen:0`, `keyUsage keyCertSign, cRLSign` |
| 사용자 인증서 | `CN=이름, OU=부서, UID=아이디`, 1년, `CA:FALSE`, `keyUsage digitalSignature, nonRepudiation`, SKI/AKI 포함 |
| 일련번호 | 128비트 난수 |
| CA 개인키 보관 | `CA_KEY_PASSWORD`로 PBKDF2-HMAC-SHA256(31만 회) → AES-256-GCM 암호화 후 DB 저장 |
| 구현 | 외부 라이브러리 없이 JDK 표준 API. X.509 DER 인코딩은 `pki/crypto/Der.java`에서 직접 구현 |

### 인증서 발급 흐름

```mermaid
sequenceDiagram
  autonumber
  actor U as 사용자
  participant B as 브라우저
  participant S as 서버(CertificateService)
  participant CA as 사내 CA

  U->>B: 로그인 비밀번호 + 인증서 암호 입력
  B->>B: ECDSA P-256 키쌍 생성
  B->>B: 개인키를 인증서 암호로 암호화 (PBKDF2 + AES-GCM)
  B->>S: POST /api/pki/challenge
  S-->>B: 1회용 challenge (5분)
  B->>B: 새 개인키로 "아이디+challenge+공개키"에 서명 (소유 증명)
  B->>S: POST /api/pki/certificates (공개키, 소유증명, 로그인 비밀번호, 개인키 암호문)
  S->>S: 본인 확인 (비밀번호) · challenge 1회 사용 · 소유 증명 서명 검증 · 암호문 형식/반복 횟수 검사
  S->>S: 기존 인증서 폐기 (REVOKED)
  S->>CA: 인증서 발급 요청
  CA-->>S: X.509 v3 인증서 (CA 개인키로 서명)
  S->>S: 인증서 + 개인키 암호문 저장
  S-->>B: 인증서
  B->>B: 같은 암호문 + 일련번호를 IndexedDB 에 저장
```

### 개인키 보관 · 복원

| 상황 | 동작 |
|---|---|
| 발급 | 암호문을 브라우저와 DB 에 함께 저장 |
| 새 PC · 새 브라우저 | 결재하려 할 때 `GET /api/pki/me/private-key-backup` 으로 **본인 암호문만** 받아 IndexedDB 에 저장 → 인증서 암호로 풀어서 서명 |
| 예전 인증서(서버 백업 없음) | 키가 있는 브라우저에서 접속하면 `PUT /api/pki/me/private-key-backup` 으로 자동 백업. 서버는 일련번호와 **공개키가 현재 인증서의 공개키와 같은지** 확인해서 다른 키로 덮어쓰기를 막는다 |
| 인증서 암호 규칙 | 10자 이상, 영문·숫자·특수문자 중 2종류 이상, 로그인 비밀번호와 달라야 함. DB 가 유출돼도 암호 대입(오프라인 공격)을 어렵게 하기 위함 |

### 한 번 인증 (인증서 인증 세션)

교수님 요구: "서명을 한 번 하고 → 추가 인증 관리를 하고 → 다음 결재 때는 인증된 상태로 그냥 사용".

| 항목 | 값 |
|---|---|
| 인증 방법 | 인증서 관리의 "인증" 버튼, 또는 서명 창에서 "로그아웃 전까지 인증 유지" |
| 보관 | 인증서 암호로 푼 개인키를 **추출 불가(non-extractable) CryptoKey** 로 IndexedDB `sessions` 저장소에 보관 (새로고침해도 유지). 키 값 자체는 자바스크립트로도 꺼낼 수 없고, 이 브라우저 안에서 서명에만 쓸 수 있다 |
| 만료 | 30분 동안 서명하지 않으면 잠금(서명할 때마다 30분 연장) · 인증 후 8시간이면 무조건 잠금 · 로그아웃 · 다른 아이디 로그인 · 재발급 · "지금 잠금" 버튼 |
| 서명 | 인증된 동안에는 암호 입력 없이 **확인 창**만 띄운다 (무엇에 서명하는지 보여주고 버튼을 한 번 더 눌러야 서명 → 실수로 한 번에 결재되지 않음) |
| 표시 | 헤더 🔓 인증서 / 🔒 인증서, 서명 창에 "몇 시까지 인증됨" |

### 서명 원본 내보내기 (`GET /api/documents/{id}/export`)

`문서번호.signed.json` (형식 `E-APPROVAL-SIGNED-DOCUMENT v1`) — 시스템 밖에서 이 파일만으로 재검증할 수 있게 다음을 담는다.

| 필드 | 내용 |
|---|---|
| `document` | 문서 필드 · 결재선 · 첨부(이름·크기·SHA-256) |
| `canonicalContent`, `documentSha256` | 서명 대상 정규화 내용과 그 해시 |
| `signatures[]` | 단계별 서명 원문 · 서명값(P1363 r‖s) · 서명 해시 · 서명자 인증서 PEM |
| `caCertificatePem` | 신뢰 기준 루트 CA |
| `verification`, `howToVerify` | 내보낼 때의 서버 검증 결과와 검증 방법 |

검증 순서: ① 인증서를 루트 CA 로 검증 ② `SHA-256(canonicalContent)` = `documentSha256` = 각 서명 원문의 `document-sha256` ③ 인증서 공개키로 서명값 검증 ④ 각 원문의 `previous-signature-sha256` = 바로 앞 `signatureSha256`.
개인키 암호문은 들어 있지 않다.

## 5. 결재 = 서명 사슬

```mermaid
flowchart LR
  D["문서 내용 해시<br/>(본문·금액·결재선·첨부파일 해시)"]
  W["[0] 기안자 서명<br/>action: SUBMIT<br/>previous: none"]
  A1["[1] 1차 결재자 서명<br/>action: APPROVE<br/>previous: H(기안 서명)"]
  A2["[2] 2차 결재자 서명<br/>action: APPROVE / REJECT<br/>previous: H(1차 서명)"]
  D -.-> W
  D -.-> A1
  D -.-> A2
  W --> A1 --> A2
```

- 모든 서명은 **같은 문서 내용 해시**에 서명한다. 따라서 결재 후 내용이 바뀌면 모든 서명이 깨진다.
- 각 서명은 **바로 앞 서명의 해시**를 포함한다. 따라서 중간 서명을 빼거나 바꾸면 뒤의 서명이 모두 깨진다.
- 결과적으로 "2차 결재자는 기안 내용과 1차 승인을 확인한 뒤 승인했다"는 **순서까지 증명**된다.

### 서명 원문 (v2)

```text
E-APPROVAL-SIGNATURE v2
document-id: 12
document-number: EXP-2026-0001            ← 기안자(step 0)는 상신 전이라 빈 값
document-sha256: 5f1c…                    ← 정규화한 문서 내용의 SHA-256
step: 1                                   ← 0 = 기안, 1.. = 결재 순서
action: APPROVE                           ← SUBMIT | APPROVE | REJECT
comment-sha256: 9a2b…                     ← 결재 의견의 SHA-256
previous-signature-sha256: 7d3e…          ← 앞 서명의 해시 (기안자는 none)
signer: gayeon_01
certificate-serial: 51A8E5A1BED148090D23B62080105A59
signed-at: 2026-11-05T02:30:00.123Z
```

- 서명 해시: `H(서명) = SHA-256(서명 원문 + "\n" + 서명값)`
- 서명 알고리즘: ECDSA P-256 / SHA-256, 서명값은 r‖s 64바이트(IEEE P1363) Base64
- 브라우저(`features/pki/crypto.ts`)와 서버(`DocumentSignatureService.signedMessage`)가 **글자 하나까지 같은** 원문을 만든다.

### 정규화한 문서 내용 (서명 대상)

```text
E-APPROVAL-DOCUMENT v2
id: 12
type: EXPENSE
writer: writer01
title-sha256: …
content-sha256: …
amount: 350000
expense-date: 2026-11-03
expense-category: MEAL
leave-type:
leave-start:
leave-end:
approvers: 1:gayeon_01,2:director9
attachment: <파일 SHA-256> <크기>
```

### 상신 · 결재 흐름

```mermaid
sequenceDiagram
  autonumber
  actor W as 기안자
  actor A as 결재자
  participant B as 브라우저
  participant S as 서버(DocumentService)
  participant V as 서명 검증(DocumentSignatureService)

  W->>B: 문서 작성 → "전자서명 후 상신"
  B->>S: 임시저장 (POST /api/documents)
  S-->>B: signing { step:0, 문서 내용, previous:none }
  W->>B: 인증서 암호 입력 (인증된 상태면 확인만)
  B->>B: 개인키 복호화(또는 인증 세션 키) → 서명 원문(SUBMIT)에 ECDSA 서명
  B->>S: POST /api/documents/{id}/submit (서명값, 시각, 인증서 번호)
  S->>V: 기안자 서명 검증 (인증서·CA·유효기간·폐기·서명값)
  V-->>S: OK
  S->>S: 문서번호 발급 · 기안 서명 저장 · 진행중 · integrity=VALID

  A->>B: 문서 열기
  B->>S: GET /api/documents/{id}
  S->>V: 서명 사슬 자동 검증 → integrity 갱신
  S-->>B: signing { step:1, 문서 내용, previous:H(기안 서명) }
  A->>B: 승인/반려 + 인증서 암호 (인증된 상태면 확인만)
  B->>B: 서명 원문(APPROVE/REJECT)에 ECDSA 서명
  B->>S: POST /api/documents/{id}/approve
  S->>V: ① 지금까지의 서명 사슬 전체 재검증 (깨져 있으면 409로 결재 차단)
  S->>V: ② 새 서명이 앞 서명을 가리키는지 + 서명값 검증
  S->>S: 결재 반영 · 서명 저장 · integrity=VALID
```

## 6. 문서 유효성 검증 (자동)

### 언제 검증하는가

| 시점 | 동작 |
|---|---|
| 상신·승인·반려할 때 | 앞선 서명 사슬 전체를 먼저 검증한다. 하나라도 깨져 있으면 **결재를 차단**한다(409). |
| 문서를 열 때 | 서명 사슬을 검증해서 `integrity`를 갱신한다. 결과가 같고 10분 이내에 확인했으면 DB 쓰기를 생략한다. |
| 주기 감사 (30분) | `SignatureAuditJob`이 상신된 모든 문서를 50건씩 다시 검증한다. 실패한 문서는 `INVALID`로 기록하고 로그를 남긴다. |
| 목록 화면 | 저장된 `integrity`를 배지로 표시한다(✔ 서명 유효 / ✖ 검증 실패). |

### 검증 항목

**문서 전체 (구조)**

| 항목 | 확인 내용 |
|---|---|
| 결재 순서 | 처리된 결재가 결재선 순서대로 앞에서부터 이어져 있는지 |
| 문서 상태 일치 | 진행중·승인완료·반려 상태가 결재 기록과 맞는지 |
| 서명 누락 없음 | 처리된 결재마다 서명이 있고, 처리 안 된 칸에는 서명이 없는지 |

**서명마다 (8개)**

| # | 항목 | 확인 내용 |
|---|---|---|
| 1 | 인증기관(CA) 서명 | 인증서가 사내 루트 CA의 개인키로 서명됐는지 |
| 2 | 인증서 유효기간 | 서명 시점(서버가 받은 시각)에 유효기간 안이었는지 |
| 3 | 인증서 폐기 여부 | 서명 **전에** 폐기된 인증서가 아닌지 (서명 후 재발급으로 폐기된 것은 유효) |
| 4 | 서명자 확인 | 인증서 주인 = 기안자/결재자 본인인지 |
| 5 | 결재 기록 일치 | 문서번호·순서·상신/승인/반려·의견이 서명 원문과 같은지 |
| 6 | 문서 위·변조 없음 | 지금 문서 내용 해시 = 서명 당시 해시인지 |
| 7 | 서명 사슬 연결 | 바로 앞 서명의 해시를 정확히 가리키는지 |
| 8 | 전자서명 값 | 인증서 공개키로 서명값이 검증되는지 |

### 무결성 상태

| 값 | 의미 |
|---|---|
| `DRAFT` | 상신 전(임시저장) |
| `VALID` | 기안자부터 마지막 결재자까지 서명 사슬이 모두 유효 |
| `INVALID` | 하나 이상 실패 → 위·변조 의심. 이후 결재 차단 |
| `LEGACY` | 기안자 서명 없이 상신된 예전 문서. 회수 후 재상신하면 서명된다 |

## 7. 보안 성질과 대응한 공격

| 공격 | 막는 방법 |
|---|---|
| DB에서 금액·본문·첨부파일을 몰래 수정 | 문서 내용 해시 불일치 → 모든 서명 실패, 다음 결재 차단, 주기 감사에서 감지 |
| DB에서 결재 상태만 "승인"으로 변경 | 서명 누락 / 문서 상태 불일치 |
| 승인 서명을 반려로, 의견을 다른 글로 바꿔치기 | 결재 기록 일치(action·comment 해시) 실패 |
| 중간 결재자 서명 삭제·건너뛰기 | 서명 사슬 연결 실패 |
| 다른 사람 인증서로 결재 | 서명자 확인 실패 (403) |
| 폐기·만료 인증서로 결재 | 결재 시점에 거부 |
| 과거 서명을 재전송 | 서명 시각 ±5분 검사, 사슬의 previous 해시가 달라서 실패 |
| 인증서 발급 요청 재전송 | challenge 1회 사용 + 5분 만료 |
| 서버 관리자가 결재 위조 | 서버에는 개인키 **암호문**만 있고 인증서 암호는 없으므로 서명 생성 불가 |
| DB 유출 후 개인키 암호문 대입 공격 | PBKDF2 60만 회 + 인증서 암호 규칙(10자·2종류). 서버는 60만 회 미만 암호문은 받지 않음 |
| 남의 개인키 암호문 조회 | `/api/pki/me/private-key-backup` 은 로그인한 본인 것만. 공개 인증서 API·내보내기 파일에는 암호문을 넣지 않음 |
| 다른 키로 백업 덮어쓰기 | 백업 공개키가 현재 인증서 공개키와 같아야 저장 |
| 인증된 상태에서 남이 내 PC 로 결재 | 30분 미사용 자동 잠금 · 8시간 상한 · 로그아웃 시 삭제 · 서명마다 확인 창. (PC 잠금은 사용자 책임) |
| DB 유출 후 CA 위조 | CA 개인키는 `CA_KEY_PASSWORD`로 암호화 저장 |

## 8. API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/pki/me` | 내 유효 인증서 + 서버 백업 여부 |
| GET · PUT | `/api/pki/me/private-key-backup` | 내 개인키 암호문 내려받기 / 백업 |
| GET | `/api/pki/users/{loginId}/certificate` | 다른 사람의 공개 인증서 |
| POST | `/api/pki/challenge` | 발급용 1회용 난수 |
| POST | `/api/pki/certificates` | 인증서 발급 (공개키, 소유 증명, 로그인 비밀번호) |
| GET | `/api/pki/certificates/{serial}` | 인증서 파일(.crt) |
| GET | `/api/pki/ca-certificate` | 루트 CA 인증서 파일 |
| POST | `/api/documents` · `/api/documents/{id}` | 임시저장 (상신 불가) |
| POST | `/api/documents/{id}/submit` | **기안자 전자서명 후 상신** |
| POST | `/api/documents/{id}/approve` · `/reject` | **결재자 전자서명 후 승인/반려** |
| GET | `/api/documents/{id}/signatures` | 서명 사슬 검증 결과 (결과는 문서에 기록) |
| GET | `/api/documents/{id}/export` | 서명 원본 `.signed.json` |

## 9. 한계와 향후 과제

| 한계 | 개선 방향 |
|---|---|
| 서명 시각은 브라우저 시각 (±5분만 확인) | 시점확인(TSA, RFC 3161) 도입 |
| 폐기 정보를 외부에 공개하지 않음 | CRL 또는 OCSP 응답 서버 |
| 개인키가 소프트웨어(브라우저 저장소)에 있고, 암호문이 서버에도 있음 | 보안토큰·스마트폰 보안칩·HSM, 서버 보관 시 추가 인증(OTP) 후 내려받기 |
| 인증 세션 동안 PC 를 비우면 남이 결재 가능 | 화면 잠금 감지, 고액 결재는 매번 암호 요구 |
| 인쇄·PDF 는 사본 (서명이 PDF 안에 들어가지 않음) | PAdES 서명 PDF 생성 |
| CA 키 비밀번호가 서버 환경변수에 있음 | CA 키를 HSM/KMS 에 보관, 루트–중간 CA 2단 구조 |
| 서명 형식이 자체 텍스트 형식 | CMS/PKCS#7, XAdES/PAdES 등 표준 서명 형식 |
