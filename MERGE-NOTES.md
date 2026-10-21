# 병합 안내

- 기준: 두 번째 압축 파일 `e-approval-integrated-documents.zip`.
- 첫 번째 압축 파일 `approval-system.zip`의 고유 소스 파일을 추가했습니다.
- `e-approval-next/`: 두 번째 파일의 Next.js 프론트엔드 (유지).
- `frontend/`: 첫 번째 파일의 Vite/React 프론트엔드 (추가). 별도 앱이므로 자동 통합하거나 대체하지 않았습니다.
- `backend/`: 두 번째 파일의 통합 Spring Boot 백엔드 (유지). 첫 번째 파일과 중복되는 백엔드 파일은 덮어쓰지 않았습니다.
- `.git`, `node_modules`, Gradle 빌드/캐시 및 로컬 DB 파일은 제외했습니다.
- 두 프론트엔드는 기술 구성이 달라, 하나의 화면으로 합치는 작업은 별도의 컴포넌트 및 API 통합이 필요합니다.
