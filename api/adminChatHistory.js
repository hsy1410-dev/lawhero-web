import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

function serializeFirestoreValue(value) {
  if (value == null || typeof value !== "object") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  if (typeof value.path === "string" && value.firestore) return value.path;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      serializeFirestoreValue(nestedValue),
    ])
  );
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  return 0;
}

async function authenticateAdmin(req) {
  const authorization = req.headers.authorization ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error("관리자 로그인이 필요합니다.");
    error.status = 401;
    throw error;
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(match[1]);
  } catch {
    const error = new Error("로그인 정보가 만료되었습니다. 다시 로그인해 주세요.");
    error.status = 401;
    throw error;
  }

  const userSnap = await db.collection("users").doc(decodedToken.uid).get();
  const role = String(userSnap.data()?.role ?? "").trim().toLowerCase();
  if (!userSnap.exists || role !== "admin") {
    const error = new Error("관리자만 채팅 기록을 볼 수 있습니다.");
    error.status = 403;
    throw error;
  }

  return decodedToken.uid;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET 요청만 지원합니다." });
  }

  try {
    await authenticateAdmin(req);

    const roomId = Array.isArray(req.query.roomId) ? req.query.roomId[0] : req.query.roomId;
    if (!roomId || typeof roomId !== "string" || roomId.length > 200) {
      return res.status(400).json({ error: "올바른 상담방 ID가 필요합니다." });
    }

    const roomRef = db.collection("chat_rooms").doc(roomId);
    const [roomSnap, messageSnap] = await Promise.all([
      roomRef.get(),
      roomRef.collection("messages").get(),
    ]);

    if (!roomSnap.exists) {
      return res.status(404).json({ error: "상담방을 찾을 수 없습니다." });
    }

    const messages = messageSnap.docs
      .map((messageDoc) => ({
        id: messageDoc.id,
        ...serializeFirestoreValue(messageDoc.data()),
        _sortTime: timestampToMillis(messageDoc.data().createdAt),
      }))
      .sort((a, b) => a._sortTime - b._sortTime)
      .map((message) => {
        const serializedMessage = { ...message };
        delete serializedMessage._sortTime;
        return serializedMessage;
      });

    return res.status(200).json({
      room: {
        id: roomSnap.id,
        ...serializeFirestoreValue(roomSnap.data()),
      },
      messages,
      count: messages.length,
    });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error("관리자 채팅 기록 조회 실패:", error);
    return res.status(status).json({
      error:
        status >= 500
          ? "채팅 기록을 불러오는 중 서버 오류가 발생했습니다."
          : error.message,
    });
  }
}
