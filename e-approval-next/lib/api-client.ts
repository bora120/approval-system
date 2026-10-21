export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const BACKEND_DOWN_MESSAGE =
  "백엔드 서버에 연결할 수 없습니다. backend 폴더에서 서버(포트 8080)가 실행 중인지 확인하세요.";

/** 실패한 응답에서 사용자에게 보여줄 메시지를 만든다 */
export async function readErrorMessage(response: Response, fallback = "요청 처리에 실패했습니다."): Promise<string> {
  const text = await response.text().catch(() => "");
  let body: { message?: string } | null = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (body?.message) return body.message;

  if (response.status === 401) return "로그인이 필요합니다.";
  if (response.status === 403) return "권한이 없거나 관리자 승인 대기 중인 계정입니다.";
  if (response.status === 413) return "첨부파일 용량이 너무 큽니다.";
  // JSON 이 아닌 500 = Next 가 백엔드로 요청을 넘기지 못한 경우(백엔드 꺼짐)
  if (response.status >= 500 && !body) return BACKEND_DOWN_MESSAGE;
  if (response.status >= 500) return "서버 오류가 발생했습니다. 백엔드 터미널의 에러 로그를 확인하세요.";
  return fallback;
}

/** fetch 래퍼: 쿠키(세션) 포함, JSON 자동 처리, 에러 메시지 통일 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(0, "서버에 연결할 수 없습니다. 개발 서버(npm run dev)가 실행 중인지 확인하세요.");
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
