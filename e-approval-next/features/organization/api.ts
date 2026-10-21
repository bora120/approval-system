import { api } from "@/lib/api-client";
import type { Role, User } from "@/lib/auth";

export type Position = "STAFF" | "TEAM_LEADER" | "DIRECTOR" | "VICE_CEO" | "CEO";

/** 조직 관리 화면에서 고를 수 있는 직책 (대표는 최초 설정에서만 생성) */
export const ASSIGNABLE_POSITIONS: { value: Position; label: string; ceoOnly: boolean }[] = [
  { value: "STAFF", label: "사원", ceoOnly: false },
  { value: "TEAM_LEADER", label: "팀장", ceoOnly: false },
  { value: "DIRECTOR", label: "본부장", ceoOnly: false },
  { value: "VICE_CEO", label: "부대표", ceoOnly: true },
];

export interface SetupStatus {
  available: boolean;
  tokenFromEnv: boolean;
}

export interface CeoSetupForm {
  setupToken: string;
  loginId: string;
  password: string;
  name: string;
  department: string;
}

export const setupApi = {
  status: () => api<SetupStatus>("/api/setup/status"),
  registerCeo: (form: CeoSetupForm) => api<User>("/api/setup/ceo", { method: "POST", body: JSON.stringify(form) }),
};

export const organizationApi = {
  allUsers: () => api<User[]>("/api/admin/users/all"),
  changePosition: (id: number, position: Position) =>
    api<User>(`/api/admin/users/${id}/position`, { method: "PATCH", body: JSON.stringify({ position }) }),
  changeRole: (id: number, role: Exclude<Role, "SUPER_ADMIN">) =>
    api<User>(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  approve: (id: number) => api<User>(`/api/admin/users/${id}/approve`, { method: "PATCH" }),
  reject: (id: number) => api<User>(`/api/admin/users/${id}/reject`, { method: "PATCH" }),
};
