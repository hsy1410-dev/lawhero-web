import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebase";

const functions = getFunctions(app, "us-central1");
export const allocateCounselorCoupons = httpsCallable(functions, "allocateCounselorCoupons");
export const issueCounselorCoupons = httpsCallable(functions, "issueCounselorCoupons");
export const getCounselorCouponSummary = httpsCallable(functions, "getCounselorCouponSummary");
export const requestLawyerConsultation = httpsCallable(functions, "requestLawyerConsultation");
export const sendLawyerChatMessage = httpsCallable(functions, "sendLawyerChatMessage");
export const closeLawyerConsultation = httpsCallable(functions, "closeLawyerConsultation");

export function consultationError(error) {
  if (["functions/internal", "functions/unavailable", "functions/not-found", "functions/deadline-exceeded"].includes(error.code)) {
    return "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요. 같은 요청은 중복 처리되지 않습니다.";
  }
  return error.message || "요청을 처리하지 못했습니다.";
}
