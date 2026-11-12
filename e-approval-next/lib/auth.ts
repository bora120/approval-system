"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

/** USER 일반 사용자 · ADMIN 관리자 · SUPER_ADMIN 대표(최고 관리자) */
export type Role = "USER" | "ADMIN" | "SUPER_ADMIN";

export const ROLE_LABEL: Record<Role, string> = {
  USER: "일반 사용자",
  ADMIN: "관리자",
  SUPER_ADMIN: "최고 관리자(대표)",
};

/** 조직 관리(가입 승인·직책 변경)를 할 수 있는지 */
export function canManageUsers(user: Pick<User, "role"> | null | undefined): boolean {
  return user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
}

export type User = {
  id: number;
  loginId: string;
  name: string;
  department: string;
  position: string | null;
  positionLabel: string;
  role: Role;
  status: "PENDING" | "ACTIVE" | "REJECTED";
  createdAt: string;
};

export type SignupFormData = {
  loginId: string;
  password: string;
  name: string;
  department: string;
  position: string;
};

const EVENT = "auth-change";
const CACHE_KEY = "approval-user";

/**
 * 화면용 캐시. 비밀번호·세션 같은 민감정보는 없고, 표시용 사용자 정보만 저장한다.
 * 실제 로그인 여부는 항상 서버(/api/auth/me)로 확인한다.
 */
function readCachedUser(): User | null {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    return value ? (JSON.parse(value) as User) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null) {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // 저장소를 쓸 수 없는 환경(시크릿 모드 등)은 무시
  }
}

function notifyAuthChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

// 한 화면에서 Header·메뉴·페이지가 동시에 /me 를 부르면 요청을 하나로 합친다
let pendingMe: Promise<User | null> | null = null;

function fetchCurrentUser(): Promise<User | null> {
  if (!pendingMe) {
    pendingMe = api<User>("/api/auth/me")
      .then((user) => {
        writeCachedUser(user);
        return user;
      })
      .catch(() => {
        writeCachedUser(null);
        return null;
      })
      .finally(() => {
        pendingMe = null;
      });
  }
  return pendingMe;
}

/** 하위 호환용: 기존 코드에서 쓰던 이름 */
export const apiRequest = api;

export async function login(loginId: string, password: string): Promise<User> {
  const user = await api<User>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ loginId, password }),
  });
  writeCachedUser(user);
  // 새로 로그인하면 예전 인증서 인증 상태(로그아웃 없이 세션이 끝난 경우 등)를 지운다
  if (typeof window !== "undefined") window.dispatchEvent(new Event("approval-logout"));
  notifyAuthChanged();
  return user;
}

export async function signup(form: SignupFormData): Promise<{ message: string; user: User }> {
  return api("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(form),
  });
}

export async function logout(): Promise<void> {
  try {
    await api<void>("/api/auth/logout", { method: "POST" });
  } catch {
    // 서버가 꺼져 있어도 화면에서는 로그아웃 처리
  } finally {
    writeCachedUser(null);
    // 인증서 인증(잠금 해제된 서명 키) 상태도 함께 지운다 → features/pki/certificate.ts
    if (typeof window !== "undefined") window.dispatchEvent(new Event("approval-logout"));
    notifyAuthChanged();
  }
}

/** 서버 세션을 확인해 새로고침 후에도 실제 로그인 상태를 복구한다. */
export function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const sync = () => {
      setLoading(true);
      fetchCurrentUser().then((u) => {
        if (!active) return;
        setUser(u);
        setLoading(false);
      });
    };

    // 다른 탭에서 로그인/로그아웃하면 캐시로 바로 반영
    const onStorage = (e: StorageEvent) => {
      if (e.key === CACHE_KEY && active) setUser(readCachedUser());
    };

    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", onStorage);
    sync();

    return () => {
      active = false;
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { user, isLoggedIn: Boolean(user), loading };
}

/** 로그인 후 돌아갈 주소. 외부 사이트로 튀는 것(오픈 리다이렉트)을 막기 위해 내부 경로만 허용 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
