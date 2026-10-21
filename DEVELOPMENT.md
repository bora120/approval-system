# 개발 가이드 — 새 기능을 추가할 때

기능마다 **백엔드 패키지 하나 + 프론트 폴더 하나**로 묶어 서로 영향을 주지 않게 만듭니다.
메신저(`messenger`)와 결재 문서(`document`)가 이 구조로 되어 있으니 그대로 따라 하면 됩니다.

## 폴더 구조
```
backend/src/main/java/com/example/approval/
 ├── domain, repository, service, controller, dto   # 공통: 사용자·로그인
 ├── exception/            # ApiException, 전역 에러 처리 (모든 기능 공통)
 ├── config/EnumColumnCompatibility.java  # enum 값을 추가했을 때 예전 DB 호환 처리 (목록에 등록)
 ├── organization/         # 최초 대표 등록, 조직 관리(직책·권한)
 ├── document/             # 결재 문서 기능
 │    ├── domain/ repository/ service/ controller/ dto/ config/
 └── messenger/            # 메신저·파일 전송 기능
      ├── MessengerLimits.java   # 제한값 모음
      ├── domain/ repository/ service/ controller/ dto/

e-approval-next/
 ├── app/<주소>/page.tsx   # 화면 경로 (얇게: Header + RequireAuth + 기능 페이지)
 ├── components/           # 공통: Header, Footer, RequireAuth, 로그인 폼
 ├── lib/                  # 공통: api-client(요청·에러), auth(로그인 상태)
 └── features/
      ├── organization/    # 최초 설정(/setup), 조직 관리(/admin)
      ├── approval/        # 결재 문서
      └── messenger/       # 메신저·파일 전송
           ├── constants.ts  types.ts  api.ts   # 설정 / 타입 / API 호출
           ├── crypto.ts  keystore.ts  engine.ts  # 암호화 / 키 보관 / 동작 묶음
           ├── components/  pages/  messenger.css
```

## 새 기능 추가 순서 (예: `notice` 공지사항)
1. **백엔드** `com.example.approval.notice` 패키지에 `domain → repository → service → controller → dto` 순서로 만들기
   - 에러는 `throw new ApiException(HttpStatus.BAD_REQUEST, "사용자에게 보여줄 메시지")` 하나로 통일
   - 로그인 사용자: 컨트롤러에서 `Authentication auth` → `auth.getName()` 이 로그인 아이디
   - 권한 확인(본인 문서인지 등)은 **반드시 서비스에서** 다시 확인 (화면에서 숨기는 것만으로는 안전하지 않음)
   - URL 은 `/api/notice/...` (SecurityConfig 가 자동으로 로그인 필수로 처리)
2. **프론트** `features/notice/` 에 `types.ts`, `api.ts`(`api()` 사용), `pages/`, `components/` 만들기
   - CSS 클래스는 기능 이름 접두어 사용 (`notice-...`) → 다른 화면과 충돌 방지
   - CSS 파일은 `app/layout.tsx` 에서 import
3. **경로** `app/notice/page.tsx` 에서 `<Header />`, `<RequireAuth>`, 기능 페이지를 감싸기
4. **메뉴** `components/HomeMenu.tsx`, `components/Header.tsx` 에 링크 추가

## 규칙
- 백엔드 제한값(파일 크기 등)을 바꾸면 프론트 `constants.ts` 도 같이 바꾸기
- 업로드 파일은 원래 이름을 디스크 경로에 쓰지 말고 랜덤 이름으로 저장 (`FileStorageService`, `EncryptedFileStorage` 참고)
- 업로드 상한은 **세 군데**를 함께 맞춰야 함
  1. 기능별 제한: `MessengerLimits.MAX_FILE_BYTES`, `DocumentUploadConfig.MAX_FILE_SIZE_MB` (+ 프론트 `constants.ts`)
  2. 서버 전체(Tomcat) 상한: `DocumentUploadConfig.SERVER_MAX_FILE_SIZE_MB`
  3. 화면 서버(Next) 프록시 상한: `e-approval-next/next.config.ts` 의 `experimental.proxyClientMaxBodySize` (기본 10MB라 꼭 확인)
- 실행은 최상위 폴더에서 `npm run dev`
- 직책(Position)·권한(Role) 같은 enum 에 값을 추가하면 `EnumColumnCompatibility.COLUMNS` 에 그 컬럼을 등록할 것
  (안 하면 예전 DB 에서 새 값을 저장할 때 오류)
- 새 화면 스타일은 `:root` 디자인 토큰(`--c-*`, `--fs-*`)만 사용 — 색상 코드를 직접 쓰지 않기
- 페이지 최상위 래퍼에는 `width: 100%` 를 줄 것 (body 가 flex 열이라 안 주면 폭이 줄어듦)
- 관리자 전용 화면은 `<RequireAuth roles={["ADMIN", "SUPER_ADMIN"]}>` 로 감싸고, 서버에서도 반드시 권한을 다시 검사

## 다음에 해볼 만한 개선
- 메신저 실시간 알림을 폴링 → WebSocket(STOMP) 으로 변경
- 승인 시 문서 해시 서명, 결재 알림
- 패스키(얼굴인식) 로그인 (`spring-security-webauthn`)
- CSRF 토큰 활성화, 로그인 실패 횟수 제한
