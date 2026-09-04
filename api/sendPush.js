import admin from "firebase-admin";

/* =======================================================
   🔥 Firebase Admin 초기화
======================================================= */
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:
        process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

function getConsultationUserId(consultation) {
  return (
    consultation?.userId ??
    consultation?.clientId ??
    consultation?.uid ??
    consultation?.user?.uid ??
    null
  );
}

function getApplicantPhone(consultation) {
  const phoneFields = [
    "applicantPhone",
    "phone",
    "phoneNumber",
    "mobile",
    "mobilePhone",
    "contactPhone",
  ];

  for (const field of phoneFields) {
    const value = consultation?.[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  return "";
}

function getConsultationText(consultation) {
  const fields = [
    "content",
    "consultationContent",
    "consultContent",
    "message",
    "description",
    "details",
    "question",
    "requestText",
    "consultation",
  ];

  for (const field of fields) {
    const value = consultation?.[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = value
        .filter((item) => typeof item === "string" && item.trim())
        .join("\n")
        .trim();
      if (joined) return joined;
    }
  }

  return "";
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

function chooseLinkedRoomId(snapshot) {
  const reusableStatuses = ["waiting", "assignment_cancelled"];
  const rooms = snapshot.docs.map((roomDoc) => ({
    id: roomDoc.id,
    ...roomDoc.data(),
  }));

  rooms.sort((a, b) => {
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
}

function getRequestSource(consultation) {
  const source =
    consultation?.requestSource ??
    consultation?.applicationSource ??
    consultation?.applicationChannel ??
    consultation?.source ??
    consultation?.platform ??
    "";

  return typeof source === "string" && source.trim() ? source.trim() : null;
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number") return value;
  return 0;
}

function chooseAutoAssignmentCounselor(counselors) {
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

async function autoAssignConsultation(consultId) {
  if (!consultId) return { assigned: false, reason: "missing-consult-id" };

  const settingsRef = db.collection("admin_settings").doc("auto_assignment");
  const requestRef = db.collection("consult_requests").doc(consultId);
  const newRoomRef = db.collection("chat_rooms").doc();

  return db.runTransaction(async (transaction) => {
    const [settingsSnap, requestSnap, counselorSnap, linkedRoomsSnap] = await Promise.all([
      transaction.get(settingsRef),
      transaction.get(requestRef),
      transaction.get(
        db.collection("users").where("role", "==", "counselor")
      ),
      transaction.get(
        db.collection("chat_rooms").where("requestId", "==", consultId)
      ),
    ]);

    if (!settingsSnap.exists || settingsSnap.data()?.enabled !== true) {
      return { assigned: false, reason: "mode-disabled" };
    }

    if (!requestSnap.exists) {
      return { assigned: false, reason: "request-not-found" };
    }

    const request = requestSnap.data();
    if (request.status !== "waiting") {
      return { assigned: false, reason: "already-processed" };
    }

    // 승인 전 고객이 사용하던 대기방을 재사용해 기존 messages를 유지한다.
    const linkedRoomId = getLinkedRoomId(request);
    const discoveredRoomId = chooseLinkedRoomId(linkedRoomsSnap);
    const reusableRoomRef = db
      .collection("chat_rooms")
      .doc(linkedRoomId ?? discoveredRoomId ?? consultId);
    const reusableRoomSnap = await transaction.get(reusableRoomRef);

    const counselors = counselorSnap.docs
      .map((counselorDoc) => ({
        id: counselorDoc.id,
        ...counselorDoc.data(),
      }))
      .filter(
        (counselor) =>
          counselor.disabled !== true && counselor.autoAssignmentEnabled !== false
      );
    const counselor = chooseAutoAssignmentCounselor(counselors);

    if (!counselor) {
      return { assigned: false, reason: "no-counselor" };
    }

    const clientId = getConsultationUserId(request);
    if (!clientId) {
      return { assigned: false, reason: "missing-client-id" };
    }

    const assignedAt = admin.firestore.Timestamp.now();
    const assignedBy = settingsSnap.data()?.updatedBy ?? "automatic-system";
    const counselorName = counselor.nickname ?? counselor.realName ?? "";
    const requestSource = getRequestSource(request);
    const shortId = request.shortId ?? consultId.slice(0, 6).toUpperCase();
    const roomRef =
      linkedRoomId || reusableRoomSnap.exists
        ? reusableRoomRef
        : newRoomRef;
    const existingRoom = reusableRoomSnap.exists
      ? reusableRoomSnap.data()
      : null;
    const consultationText = getConsultationText(request);
    const shouldSeedInitialMessage =
      Boolean(consultationText) && !hasRoomActivity(existingRoom);
    const initialMessageAt = request.createdAt ?? assignedAt;
    const existingUnread =
      existingRoom?.unread && typeof existingRoom.unread === "object"
        ? existingRoom.unread
        : {};

    transaction.set(roomRef, {
      clientId,
      counselorId: counselor.id,
      users: [clientId, counselor.id],
      requestId: consultId,
      shortId,
      category: request.category ?? "법률 상담",
      applicantPhone: getApplicantPhone(request),
      ...(requestSource ? { requestSource } : {}),
      status: "assigned",
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      unread: {
        ...existingUnread,
        [counselor.id]:
          shouldSeedInitialMessage || hasRoomActivity(existingRoom)
            ? Math.max(Number(existingUnread[counselor.id] ?? 0), 1)
            : Number(existingUnread[counselor.id] ?? 0),
      },
      ...(!existingRoom
        ? {
            createdAt:
              request.createdAt ??
              admin.firestore.FieldValue.serverTimestamp(),
            lastMessage: consultationText,
            lastMessageAt: consultationText ? initialMessageAt : null,
            ...(consultationText ? { lastSender: clientId } : {}),
          }
        : shouldSeedInitialMessage
          ? {
              lastMessage: consultationText,
              lastMessageAt: initialMessageAt,
              lastSender: clientId,
            }
          : {}),
    }, { merge: true });

    if (shouldSeedInitialMessage) {
      transaction.set(
        roomRef.collection("messages").doc("consultation-request"),
        {
          uid: clientId,
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
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      assignedBy,
      assignmentMode: "automatic",
      assignmentHistory: admin.firestore.FieldValue.arrayUnion({
        action: "assigned",
        assignmentMode: "automatic",
        counselorId: counselor.id,
        counselorNickname: counselorName,
        performedBy: assignedBy,
        at: assignedAt,
      }),
    });

    transaction.update(db.collection("users").doc(counselor.id), {
      assignedOpenCount: admin.firestore.FieldValue.increment(1),
      lastAutoAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      assigned: true,
      counselorId: counselor.id,
      roomId: roomRef.id,
      shortId,
    };
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maskToken(token) {
  if (typeof token !== "string") return String(token || "");
  if (token.length <= 18) return token;
  return `${token.slice(0, 10)}...${token.slice(-8)}`;
}
/* =======================================================
   🔥 UID 기준 토큰 조회
======================================================= */
async function getTokensByUid(uid) {
  if (!uid) return [];
  const snap = await db.collection("fcmTokens").doc(uid).get();
  if (!snap.exists) return [];
  return Object.keys(snap.data().tokens || {});
}

/* =======================================================
   🔥 토큰 분리 (Expo / FCM)
======================================================= */
function splitTokens(tokens) {
  return tokens.reduce(
    (acc, token) => {
      if (
        typeof token === "string" &&
        /^Expo(nent)?PushToken\[/.test(token)
      ) {
        acc.expo.push(token);
      } else {
        acc.web.push(token);
      }
      return acc;
    },
    { expo: [], web: [] }
  );
}

/* =======================================================
   📱 Expo Push
======================================================= */
async function sendExpoPush(tokens, title, body, data) {
  const summary = {
    requested: tokens.length,
    success: 0,
    failed: 0,
    ticketIds: [],
    ticketTokenMap: {},
  };

  if (!tokens.length) return summary;

  for (const token of tokens) {
    try {
      const res = await fetch(
        "https://exp.host/--/api/v2/push/send",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: token,
            title,
            body,
            data,
            sound: "default",
            priority: "high",
          }),
        }
      );

      const json = await res.json();
      const result = json?.data;

      if (!res.ok || !result || result.status !== "ok") {
        summary.failed += 1;
        console.log("❌ Expo error:", json);

        if (result?.details?.error === "DeviceNotRegistered") {
          await removeDeadToken(token);
        }
      } else {
        summary.success += 1;
        summary.ticketIds.push(result.id);
        summary.ticketTokenMap[result.id] = token;
        console.log("✅ Expo push 성공:", result.id);
      }

    } catch (err) {
      summary.failed += 1;
      console.log("❌ Expo fetch 실패:", err);
    }
  }

  return summary;
}

async function getExpoPushReceipts(ticketIds) {
  if (!ticketIds.length) return {};

  const res = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: ticketIds }),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(
      `Expo receipts 요청 실패: ${res.status} ${JSON.stringify(json)}`
    );
  }

  return json?.data || {};
}

async function summarizeExpoReceipts(receipts, ticketTokenMap) {
  const summary = {
    requested: Object.keys(ticketTokenMap).length,
    ok: 0,
    failed: 0,
    pending: 0,
    errors: {},
    details: {},
  };

  for (const [ticketId, token] of Object.entries(ticketTokenMap)) {
    const receipt = receipts[ticketId];

    if (!receipt) {
      summary.pending += 1;
      continue;
    }

    if (receipt.status === "ok") {
      summary.ok += 1;
      continue;
    }

    summary.failed += 1;
    const error =
      receipt?.details?.error || receipt?.message || "UnknownError";
    summary.errors[error] = (summary.errors[error] || 0) + 1;

    let detailKey = error;

    if (error === "DeveloperError") {
      const fcmResponse = receipt?.details?.fcm?.response || "";

      if (fcmResponse.includes("SENDER_ID_MISMATCH")) {
        detailKey = "SenderIdMismatch";
        await removeDeadToken(token);
      }
    }

    summary.details[detailKey] =
      (summary.details[detailKey] || 0) + 1;

    if (error === "DeviceNotRegistered") {
      await removeDeadToken(token);
    }
  }

  return summary;
}
/* =======================================================
   💻 FCM Push
======================================================= */
async function sendWebPush(tokens, title, body, data) {
  const summary = {
    requested: tokens.length,
    success: 0,
    failed: 0,
    errors: {},
  };

  if (!tokens.length) return summary;

  for (const token of tokens) {
    try {
      const notificationUrl =
        data?.type === "consult" && data?.consultId
          ? `/admin/consult/${data.consultId}`
          : data?.type === "chat" && data?.consultId
            ? `/counselor/chat/${data.consultId}`
            : data?.type === "assign"
              ? "/counselor/dashboard"
              : "/";

      await admin.messaging().send({
        token,
        data: {
          title: String(title),
          body: String(body),
          type: String(data?.type || "notification"),
          consultId: String(data?.consultId || ""),
          adminTarget: String(data?.adminTarget || ""),
          url: notificationUrl,
        },
        webpush: {
          headers: { Urgency: "high" },
          fcmOptions: { link: notificationUrl },
        },
      });
      summary.success += 1;
    } catch (err) {
      summary.failed += 1;
      const errorCode = err?.code || "unknown";
      summary.errors[errorCode] =
        (summary.errors[errorCode] || 0) + 1;
      console.log(
        `❌ Web push error (${maskToken(token)}):`,
        errorCode,
        err?.message || ""
      );

      if (
        err.code ===
        "messaging/registration-token-not-registered"
      ) {
        await removeDeadToken(token);
      }
    }
  }

  console.log("📬 Web push summary:", summary);
  return summary;
}

/* =======================================================
   ☠ 죽은 토큰 제거
======================================================= */
async function removeDeadToken(token) {
  const snap = await db.collection("fcmTokens").get();

  for (const doc of snap.docs) {
    const tokens = doc.data().tokens || {};
    if (tokens[token]) {
      await doc.ref.update(
        new admin.firestore.FieldPath("tokens", token),
        admin.firestore.FieldValue.delete()
      );
    }
  }
}

/* =======================================================
   🔥 메인 API 핸들러
======================================================= */
export default async function handler(req, res) {
  try {
    const allowedOrigins = [
      "https://www.lawhero.kr",
      "https://lawhero.kr",
      "https://lawhero-web.vercel.app",
      "https://lawheroweb.vercel.app",
      "http://localhost:5173",
      "http://localhost:3000",
    ];

    const origin = req.headers.origin;

    if (allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }

    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    const {
      type,
      targetUid,
      counselorUid,
      consultId,
      message,
      adminTarget,
      waitForReceipts,
    } = req.body;

    if (!type || !message) {
      return res.status(400).json({ error: "type & message required" });
    }

    let notificationType = type;
    let notificationMessage = message;
    let notificationCounselorUid = counselorUid;
    let autoAssignment = null;

    if (type === "consult" && consultId) {
      try {
        autoAssignment = await autoAssignConsultation(consultId);

        for (
          let attempt = 0;
          autoAssignment.reason === "request-not-found" && attempt < 2;
          attempt += 1
        ) {
          await delay(250);
          autoAssignment = await autoAssignConsultation(consultId);
        }

        if (autoAssignment.assigned) {
          notificationType = "assign";
          notificationCounselorUid = autoAssignment.counselorId;
          notificationMessage = `새 상담이 자동 배정되었습니다. 상담코드: ${autoAssignment.shortId}`;
        } else if (autoAssignment.reason === "already-processed") {
          return res.json({ success: true, autoAssignment });
        }
      } catch (assignmentError) {
        console.error(`상담 요청 ${consultId} 서버 자동배정 실패:`, assignmentError);
        autoAssignment = { assigned: false, reason: "assignment-error" };
      }
    }

    let tokens = [];
    let title = "";

    /* =======================================================
       🔥 TYPE 분기
    ======================================================= */
    switch (notificationType) {
      case "chat":
        if (!targetUid) {
          return res.status(400).json({ error: "targetUid required" });
        }

        tokens = await getTokensByUid(targetUid);
        title = "💬 새 메시지";
        break;

      case "assign":
        if (!notificationCounselorUid) {
          return res.status(400).json({ error: "counselorUid required" });
        }

        tokens = await getTokensByUid(notificationCounselorUid);
        title = "🧑‍⚖️ 상담 배정";
        break;

      case "consult": {
        const adminUsers = await db
          .collection("users")
          .where("role", "==", "admin")
          .get();

        for (const doc of adminUsers.docs) {
          const adminUid = doc.id;
          const userTokens = await getTokensByUid(adminUid);
          tokens.push(...userTokens);
        }

        title = adminTarget === "special"
          ? "📥 새 특수 상담 요청"
          : adminTarget === "general"
            ? "📥 새 일반 상담 요청"
            : "📥 새 상담 요청";
        break;
      }

      case "notice": {
        const allUsers = await db.collection("fcmTokens").get();

        for (const doc of allUsers.docs) {
          const userTokens = Object.keys(doc.data().tokens || {});
          tokens.push(...userTokens);
        }

        title = "📢 공지사항";
        break;
      }

      default:
        return res.status(400).json({ error: "Unknown type" });
    }

    /* =======================================================
       🔥 공통 발송 로직
    ======================================================= */

    if (!tokens.length) {
      console.log("⚠️ 보낼 토큰 없음");
      return res.json({ success: true, autoAssignment });
    }

    tokens = [...new Set(tokens)];
    const { expo, web } = splitTokens(tokens);

    console.log(
      `📊 ${notificationType}${adminTarget ? `(${adminTarget})` : ""} → Expo:${expo.length}, Web:${web.length}`
    );

    if (!expo.length && web.length) {
      console.log(
        "ℹ️ 현재 저장된 토큰은 웹 FCM 토큰만 있으며 Expo 토큰은 없습니다."
      );
    }

    if (type === "notice" && web.length) {
      console.log(
        `ℹ️ notice는 Expo 외 FCM 토큰 ${web.length}건도 함께 발송`
      );
    }

    const expoSummary = await sendExpoPush(expo, title, notificationMessage, {
      type: notificationType,
      consultId,
      adminTarget,
    });

    if (waitForReceipts && expoSummary.ticketIds.length) {
      try {
        await delay(3000);
        const receipts = await getExpoPushReceipts(
          expoSummary.ticketIds
        );
        expoSummary.receipts = await summarizeExpoReceipts(
          receipts,
          expoSummary.ticketTokenMap
        );

        console.log("📬 Expo receipts:", expoSummary.receipts);
      } catch (receiptErr) {
        expoSummary.receiptError = receiptErr.toString();
        console.log("❌ Expo receipt 조회 실패:", receiptErr);
      }
    }

    const webSummary = await sendWebPush(web, title, notificationMessage, {
      type: notificationType,
      consultId,
      adminTarget,
    });

    const success =
      expoSummary.success + webSummary.success > 0;

    console.log("📦 sendPush summary:", {
      type: notificationType,
      adminTarget,
      expo: {
        requested: expoSummary.requested,
        success: expoSummary.success,
        failed: expoSummary.failed,
      },
      web: webSummary,
      success,
    });

    return res.json({
      success,
      autoAssignment,
      summary: {
        tokens: {
          total: tokens.length,
          expo: expo.length,
          web: web.length,
        },
        expo: {
          requested: expoSummary.requested,
          success: expoSummary.success,
          failed: expoSummary.failed,
          receipts: expoSummary.receipts,
          receiptError: expoSummary.receiptError,
        },
        web: webSummary,
      },
    });
  } catch (err) {
    console.error("🔥 sendPush ERROR:", err);
    return res.status(500).json({ error: err.toString() });
  }
}
