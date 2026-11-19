import { api } from "@/lib/api-client";
import type { Role, User } from "@/lib/auth";

export type Position = "STAFF" | "JUNIOR" | "ASSISTANT_MANAGER" | "MANAGER" | "DEPUTY_GENERAL_MANAGER" | "GENERAL_MANAGER" | "VICE_CEO" | "CEO";

/** 조직 관리 화면에서 변경할 수 있는 일반 직원 직급 (부대표·대표 제외) */
export const ASSIGNABLE_POSITIONS: { value: Position; label: string; ceoOnly: boolean }[] = [
  { value: "STAFF", label: "사원", ceoOnly: false },
  { value: "JUNIOR", label: "주임", ceoOnly: false },
  { value: "ASSISTANT_MANAGER", label: "대리", ceoOnly: false },
  { value: "MANAGER", label: "과장", ceoOnly: false },
  { value: "DEPUTY_GENERAL_MANAGER", label: "차장", ceoOnly: false },
  { value: "GENERAL_MANAGER", label: "부장", ceoOnly: false },
];

export interface OrganizationMember {
  id: number;
  name: string;
  department: string | null;
  position: Position;
  positionLabel: string;
}

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
  directory: () => api<OrganizationMember[]>("/api/organization/tree"),
  changePosition: (id: number, position: Position) =>
    api<User>(`/api/admin/users/${id}/position`, { method: "PATCH", body: JSON.stringify({ position }) }),
  changeRole: (id: number, role: Exclude<Role, "SUPER_ADMIN">) =>
    api<User>(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  approve: (id: number) => api<User>(`/api/admin/users/${id}/approve`, { method: "PATCH" }),
  reject: (id: number) => api<User>(`/api/admin/users/${id}/reject`, { method: "PATCH" }),
};
