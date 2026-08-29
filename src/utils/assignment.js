import {
  arrayUnion,
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import { db } from "../config/firebase";
import { getApplicationChannel, getConsultationUserId, getPhoneNumber } from "./consultation";
import { sendPush } from "./sendPush";

export const AUTO_ASSIGNMENT_SETTINGS_REF = doc(
  db,
  "admin_settings",
  "auto_assignment"
);

export function isAutoAssignableCounselor(counselor) {
  return (
    counselor?.role === "counselor" &&
    counselor?.disabled !== true &&
    counselor?.autoAssignmentEnabled !== false
  );
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number") return value;

  const seconds = value.seconds ?? value._seconds;
  return typeof seconds === "number" ? seconds * 1000 : 0;
}

function chooseCounselor(counselors) {
  return [...counselors].sort((a, b) => {
    const loadDifference =
      Number(a.assignedOpenCount ?? 0) - Number(b.assignedOpenCount ?? 0);
    if (loadDifference !== 0) return loadDifference;

    const assignedTimeDifference =
      timestampToMillis(a.lastAutoAssignedAt) -
      timestampToMillis(b.lastAutoAssignedAt);
    if (assignedTimeDifference !== 0) return assignedTimeDifference;

    return a.id.localeCompare(b.id);
  })[0];
}

export async function assignWaitingConsultation({
  requestId,
  request,
  counselors,
  assignedBy,
  assignmentMode = "manual",
}) {
  const candidates = counselors.filter(isAutoAssignableCounselor);
  if (candidates.length === 0) {
    return { assigned: false, reason: "no-counselor" };
  }

  const requestRef = doc(db, "consult_requests", requestId);
  const roomRef = doc(collection(db, "chat_rooms"));
  const assignedAt = Timestamp.now();

  const result = await runTransaction(db, async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists()) {
      return { assigned: false, reason: "request-not-found" };
    }

    const latestRequest = { id: requestSnap.id, ...requestSnap.data() };
    if (latestRequest.status !== "waiting") {
      return { assigned: false, reason: "already-processed" };
    }

    const counselorSnapshots = await Promise.all(
      candidates.map((candidate) =>
        transaction.get(doc(db, "users", candidate.id))
      )
    );
    const availableCounselors = counselorSnapshots
      .filter((snapshot) => snapshot.exists())
      .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
      .filter(isAutoAssignableCounselor);
    const counselor = chooseCounselor(availableCounselors);

    if (!counselor) {
      return { assigned: false, reason: "no-counselor" };
    }

    const requestUserId = getConsultationUserId(latestRequest);
    if (!requestUserId) {
      return { assigned: false, reason: "missing-client-id" };
    }

    const requestSource = getApplicationChannel(latestRequest);
    const counselorName = counselor.nickname ?? counselor.realName ?? "";
    const shortId =
      latestRequest.shortId ?? requestId.slice(0, 6).toUpperCase();

    transaction.set(roomRef, {
      clientId: requestUserId,
      counselorId: counselor.id,
      users: [requestUserId, counselor.id],
      requestId,
      shortId,
      category: latestRequest.category ?? "법률 상담",
      applicantPhone: getPhoneNumber(request, latestRequest),
      ...(requestSource !== "unknown" ? { requestSource } : {}),
      status: "assigned",
      lastMessage: "",
      lastMessageAt: null,
      createdAt: serverTimestamp(),
    });

    transaction.update(requestRef, {
      status: "assigned",
      counselorId: counselor.id,
      roomId: roomRef.id,
      assignedCounselor: {
        id: counselor.id,
        nickname: counselor.nickname ?? "",
        realName: counselor.realName ?? "",
      },
      assignedAt: serverTimestamp(),
      assignedBy,
      assignmentMode,
      assignmentHistory: arrayUnion({
        action: "assigned",
        assignmentMode,
        counselorId: counselor.id,
        counselorNickname: counselorName,
        performedBy: assignedBy,
        at: assignedAt,
      }),
    });

    transaction.update(doc(db, "users", counselor.id), {
      assignedOpenCount: increment(1),
      ...(assignmentMode === "automatic"
        ? { lastAutoAssignedAt: serverTimestamp() }
        : {}),
    });

    return {
      assigned: true,
      counselor,
      roomId: roomRef.id,
      shortId,
      assignedAt,
    };
  });

  return result;
}

export async function notifyAssignedCounselor(requestId, assignmentResult) {
  if (!assignmentResult?.assigned) return;

  await sendPush({
    type: "assign",
    counselorUid: assignmentResult.counselor.id,
    consultId: requestId,
    message: `새 상담이 배정되었습니다. 상담코드: ${assignmentResult.shortId}`,
  });
}
