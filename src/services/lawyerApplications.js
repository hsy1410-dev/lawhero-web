import { getFunctions, httpsCallable } from "firebase/functions";
import { app, auth } from "../config/firebase";

// Same callable/region as C:\naranapp\functions\lawyerApplications.js.
const reviewApplication = httpsCallable(getFunctions(app, "us-central1"), "reviewLawyerApplication");

export async function fetchLawyerApplications(params = {}, signal) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("관리자로 다시 로그인해 주세요.");
  const response = await fetch(`/api/adminLawyerApplications?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("회원 승인 API에 연결하지 못했습니다. API 서버 실행 또는 웹 배포 상태를 확인해 주세요.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "신청 정보를 불러오지 못했습니다.");
  return data;
}

export async function reviewLawyerApplication(uid, decision, reason = "") {
  const { data } = await reviewApplication({ uid, decision, reason: reason.trim() });
  if (data?.status !== (decision === "approve" ? "approved" : "rejected")) {
    throw new Error("처리 결과를 확인하지 못했습니다. 신청 정보를 새로고침해 주세요.");
  }
  return data;
}

export function applicationError(error) {
  if (["functions/unavailable", "functions/internal", "functions/not-found"].includes(error.code)) {
    return "승인 서버에 연결하지 못했습니다. reviewLawyerApplication 함수 배포 상태와 네트워크를 확인해 주세요.";
  }
  if (["functions/unauthenticated", "functions/permission-denied"].includes(error.code)) {
    return "심사 권한이 없습니다. 관리자 계정으로 다시 로그인해 주세요.";
  }
  return error.message || "요청을 처리하지 못했습니다. 다시 시도해 주세요.";
}
