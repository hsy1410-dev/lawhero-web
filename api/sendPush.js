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
   🔥 토큰 분리 (Expo / Web)
======================================================= */
function splitTokens(tokens) {
  return tokens.reduce(
    (acc, token) => {
      if (token.startsWith("ExponentPushToken")) {
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
  if (!tokens.length) return;

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

      // 🔥 여기 수정
      const result = json?.data;

      if (!result || result.status !== "ok") {
        console.log("❌ Expo error:", json);
      } else {
        console.log("✅ Expo push 성공:", result.id);
      }

    } catch (err) {
      console.log("❌ Expo fetch 실패:", err);
    }
  }
}
/* =======================================================
   💻 Web FCM Push
======================================================= */
async function sendWebPush(tokens, title, body, data) {
  if (!tokens.length) return;

  for (const token of tokens) {
    try {
      await admin.messaging().send({
        token,
        notification: { title, body },
        webpush: {
          notification: {
            icon: "/icon-192.png",
            badge: "/icon-96.png",
          },
        },
        data: Object.fromEntries(
          Object.entries(data || {}).map(([k, v]) => [
            k,
            String(v),
          ])
        ),
      });
    } catch (err) {
      console.log("❌ Web push error:", err.code);

      if (
        err.code ===
        "messaging/registration-token-not-registered"
      ) {
        await removeDeadToken(token);
      }
    }
  }
}

/* =======================================================
   ☠ 죽은 토큰 제거
======================================================= */
async function removeDeadToken(token) {
  const snap = await db.collection("fcmTokens").get();

  for (const doc of snap.docs) {
    const tokens = doc.data().tokens || {};
    if (tokens[token]) {
      await doc.ref.update({
        [`tokens.${token}`]:
          admin.firestore.FieldValue.delete(),
      });
    }
  }
}

/* =======================================================
   🔥 메인 API 핸들러
======================================================= */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    const {
      type,
      targetUid,
      counselorUid,
      consultId,
      message,
    } = req.body;

    if (!type || !message) {
      return res
        .status(400)
        .json({ error: "type & message required" });
    }

    let tokens = [];
    let title = "";

    /* =======================================================
       🔥 TYPE 분기
    ======================================================= */
    switch (type) {

      case "chat":
        if (!targetUid)
          return res.status(400).json({ error: "targetUid required" });

        tokens = await getTokensByUid(targetUid);
        title = "💬 새 메시지";
        break;

      case "assign":
        if (!counselorUid)
          return res.status(400).json({ error: "counselorUid required" });

        tokens = await getTokensByUid(counselorUid);
        title = "🧑‍⚖️ 상담 배정";
        break;

      case "consult":
        const adminUsers = await db
          .collection("users")
          .where("role", "==", "admin")
          .get();

        for (const doc of adminUsers.docs) {
          const adminUid = doc.id;
          const userTokens = await getTokensByUid(adminUid);
          tokens.push(...userTokens);
        }

        title = "📥 새 빠른 상담 요청";
        break;

      case "notice":
        const allUsers = await db.collection("fcmTokens").get();

        for (const doc of allUsers.docs) {
          const userTokens = Object.keys(doc.data().tokens || {});
          tokens.push(...userTokens);
        }

        title = "📢 공지사항";
        break;

      default:
        return res.status(400).json({ error: "Unknown type" });
    }

    /* =======================================================
       🔥 공통 발송 로직
    ======================================================= */

    if (!tokens.length) {
      console.log("⚠️ 보낼 토큰 없음");
      return res.json({ success: true });
    }
tokens = [...new Set(tokens)];
    const { expo, web } = splitTokens(tokens);

    console.log(
      `📊 ${type} → Expo:${expo.length}, Web:${web.length}`
    );

    // 🔥 notice는 Expo만 발송
    if (type === "notice") {
      await sendExpoPush(expo, title, message, {
        type,
        consultId,
      });
    } else {
      await sendExpoPush(expo, title, message, {
        type,
        consultId,
      });

      await sendWebPush(web, title, message, {
        type,
        consultId,
      });
    }

    return res.json({ success: true });

  } catch (err) {
    console.error("🔥 sendPush ERROR:", err);
    return res.status(500).json({ error: err.toString() });
  }
}