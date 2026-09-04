import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";

import { db } from "../config/firebase";
import {
  getApplicationChannel,
  getConsultationText,
  getConsultationUserId,
  getPhoneNumber,
} from "./consultation";
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

function getLinkedRoomId(consultation) {
  const candidates = [
    consultation?.roomId,
    consultation?.chatRoomId,
    consultation?.conversationId,
    consultation?.room?.id,
  ];

  return (
    candidates.find(
      (value) =>
        typeof value === "string" &&
        value.trim() &&
        !value.includes("/")
    )?.trim() ?? null
  );
}

function hasRoomActivity(room) {
  return Boolean(
    room?.lastMessage ||
      room?.lastMessageAt ||
      room?.lastSender ||
      room?.messageCount
  );
}

async function findRoomByRequestId(requestId) {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, "chat_rooms"),
        where("requestId", "==", requestId)
      )
    );

    const rooms = snapshot.docs.map((roomDoc) => ({
      id: roomDoc.id,
      ...roomDoc.data(),
    }));

    rooms.sort((a, b) => {
      const reusableStatuses = ["waiting", "assignment_cancelled"];
      const statusDifference =
        Number(reusableStatuses.includes(b.status)) -
        Number(reusableStatuses.includes(a.status));
      if (statusDifference !== 0) return statusDifference;

      return (
        (timestampToMillis(b.lastMessageAt) || timestampToMillis(b.createdAt)) -
        (timestampToMillis(a.lastMessageAt) || timestampToMillis(a.createdAt))
      );
    });

    return rooms[0]?.id ?? null;
  } catch (error) {
    console.warn(`상담 요청 ${requestId}의 기존 채팅방 조회 실패:`, error);
    return null;
  }
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
  const newRoomRef = doc(collection(db, "chat_rooms"));
  const assignedAt = Timestamp.now();
  const discoveredRoomId = getLinkedRoomId(request)
    ? null
    : await findRoomByRequestId(requestId);

  const result = await runTransaction(db, async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists()) {
      return { assigned: false, reason: "request-not-found" };
    }

    const latestRequest = { id: requestSnap.id, ...requestSnap.data() };
    if (latestRequest.status !== "waiting") {
      return { assigned: false, reason: "already-processed" };
    }

    // 앱은 상담 승인 전 대기 채팅방을 먼저 만들 수 있다. 연결된 방이
    // 있으면 새 방을 만들지 않고 그대로 배정해야 messages 하위 컬렉션이 보존된다.
    const linkedRoomId = getLinkedRoomId(latestRequest);
    const reusableRoomRef = doc(
      db,
      "chat_rooms",
      linkedRoomId ?? discoveredRoomId ?? requestId
    );
    const [counselorSnapshots, reusableRoomSnap] = await Promise.all([
      Promise.all(
        candidates.map((candidate) =>
          transaction.get(doc(db, "users", candidate.id))
        )
      ),
      transaction.get(reusableRoomRef),
    ]);
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
    const roomRef =
      linkedRoomId || reusableRoomSnap.exists()
        ? reusableRoomRef
        : newRoomRef;
    const existingRoom = reusableRoomSnap.exists()
      ? reusableRoomSnap.data()
      : null;
    const consultationText = getConsultationText(latestRequest);
    const shouldSeedInitialMessage =
      Boolean(consultationText) && !hasRoomActivity(existingRoom);
    const initialMessageAt = latestRequest.createdAt ?? assignedAt;
    const existingUnread =
      existingRoom?.unread && typeof existingRoom.unread === "object"
        ? existingRoom.unread
        : {};

    const roomData = {
      clientId: requestUserId,
      counselorId: counselor.id,
      users: [requestUserId, counselor.id],
      requestId,
      shortId,
      category: latestRequest.category ?? "법률 상담",
      applicantPhone: getPhoneNumber(request, latestRequest),
      ...(requestSource !== "unknown" ? { requestSource } : {}),
      status: "assigned",
      assignedAt: serverTimestamp(),
      unread: {
        ...existingUnread,
        [counselor.id]:
          shouldSeedInitialMessage || hasRoomActivity(existingRoom)
            ? Math.max(Number(existingUnread[counselor.id] ?? 0), 1)
            : Number(existingUnread[counselor.id] ?? 0),
      },
      ...(!existingRoom
        ? {
            createdAt: latestRequest.createdAt ?? serverTimestamp(),
            lastMessage: consultationText,
            lastMessageAt: consultationText ? initialMessageAt : null,
            ...(consultationText ? { lastSender: requestUserId } : {}),
          }
        : shouldSeedInitialMessage
          ? {
              lastMessage: consultationText,
              lastMessageAt: initialMessageAt,
              lastSender: requestUserId,
            }
          : {}),
    };

    transaction.set(roomRef, roomData, { merge: true });

    if (shouldSeedInitialMessage) {
      transaction.set(
        doc(roomRef, "messages", "consultation-request"),
        {
          uid: requestUserId,
          text: consultationText,
          createdAt: initialMessageAt,
          read: false,
          source: "consultation_request",
        },
        { merge: true }
      );
    }

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
