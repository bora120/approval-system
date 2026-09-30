# 전자결재 시스템 – 로그인/회원가입

```
approval-system/
├── backend/    Spring Boot 3.5 (Java 17) – 인증 API
└── frontend/   React + TypeScript (Vite) – 로그인/회원가입 화면
```

## 가입 규칙
| 직책 | 가입 후 상태 | 로그인 |
|---|---|---|
| 사원 | ACTIVE | 바로 가능 |
| 팀장 / 본부장 / 대표 | PENDING | 관리자 승인 후 가능 |
| 관리자(ADMIN) | 회원가입 불가 | 서버 첫 실행 때 자동 생성 (`admin` / `admin1234!`) |

## VS Code 준비물
- JDK 17 또는 21 (Gradle 8.14 기준, JDK 25는 미지원)
- Node.js 20 이상
- 확장: **Extension Pack for Java**, **Spring Boot Extension Pack**

## 실행 (터미널 2개)
```bash
# 1) 백엔드 – http://localhost:8080
cd backend
./gradlew bootRun          # Windows: gradlew.bat bootRun

# 2) 프론트엔드 – http://localhost:5173
cd frontend
npm install
npm run dev
```
브라우저에서 http://localhost:5173 접속

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

## 메인 페이지 담당 팀원에게
- `frontend/src/pages/HomePlaceholder.tsx`를 메인 페이지로 교체하면 됩니다.
- 로그인 정보: `const { user, logout } = useAuth()` → `user.name`, `user.positionLabel`, `user.role`
- 로그인이 필요한 페이지는 `App.tsx`의 `<ProtectedRoute />` 안에 Route를 추가하세요.

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
- [ ] MySQL 전환 (`build.gradle`, `application.yml` 주석 참고)
- [ ] 관리자 비밀번호 변경
