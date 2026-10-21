import { redirect } from "next/navigation";

/** 예전 결재 화면 주소 → 실제 결재함으로 이동 */
export default function ApprovalPage() {
  redirect("/documents?tab=INBOX");
}
