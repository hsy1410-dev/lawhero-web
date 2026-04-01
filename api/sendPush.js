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
        console.log("✅ Expo push 성공:", result.id);
      }

    } catch (err) {
      summary.failed += 1;
      console.log("❌ Expo fetch 실패:", err);
    }
  }

  return summary;
}
/* =======================================================
   💻 Web FCM Push
======================================================= */
async function sendWebPush(tokens, title, body, data) {
  const summary = {
    requested: tokens.length,
    success: 0,
    failed: 0,
  };

  if (!tokens.length) return summary;

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
      summary.success += 1;
    } catch (err) {
      summary.failed += 1;
      console.log("❌ Web push error:", err.code);

      if (
        err.code ===
        "messaging/registration-token-not-registered"
      ) {
        await removeDeadToken(token);
      }
    }
  }

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
    } = req.body;

    if (!type || !message) {
      return res.status(400).json({ error: "type & message required" });
    }

    let tokens = [];
    let title = "";

    /* =======================================================
       🔥 TYPE 분기
    ======================================================= */
    switch (type) {
      case "chat":
        if (!targetUid) {
          return res.status(400).json({ error: "targetUid required" });
        }

        tokens = await getTokensByUid(targetUid);
        title = "💬 새 메시지";
        break;

      case "assign":
        if (!counselorUid) {
          return res.status(400).json({ error: "counselorUid required" });
        }

        tokens = await getTokensByUid(counselorUid);
        title = "🧑‍⚖️ 상담 배정";
        break;

      case "consult": {
        if (!adminTarget) {
          return res.status(400).json({ error: "adminTarget required" });
        }

        const adminUsers = await db
          .collection("users")
          .where("role", "==", "admin")
          .where("adminType", "==", adminTarget)
          .get();

        for (const doc of adminUsers.docs) {
          const adminUid = doc.id;
          const userTokens = await getTokensByUid(adminUid);
          tokens.push(...userTokens);
        }

        title =
          adminTarget === "special"
            ? "📥 새 특수 상담 요청"
            : "📥 새 일반 상담 요청";
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
      return res.json({ success: true });
    }

    tokens = [...new Set(tokens)];
    const { expo, web } = splitTokens(tokens);
    const shouldSendWeb = type !== "notice";

    console.log(
      `📊 ${type}${adminTarget ? `(${adminTarget})` : ""} → Expo:${expo.length}, Web:${web.length}`
    );

    if (type === "notice" && web.length) {
      console.log(
        `ℹ️ notice는 앱 전용 발송이라 Web ${web.length}건은 제외`
      );
    }

    if (type === "notice" && expo.length === 0) {
      return res.json({
        success: false,
        error: "등록된 앱(Expo) 푸시 토큰이 없습니다.",
        summary: {
          expo: { requested: 0, success: 0, failed: 0 },
          web: {
            requested: web.length,
            success: 0,
            failed: 0,
            skipped: true,
          },
        },
      });
    }

    const expoSummary = await sendExpoPush(expo, title, message, {
      type,
      consultId,
      adminTarget,
    });

    const webSummary = shouldSendWeb
      ? await sendWebPush(web, title, message, {
          type,
          consultId,
          adminTarget,
        })
      : {
          requested: web.length,
          success: 0,
          failed: 0,
          skipped: true,
        };

    const success = shouldSendWeb
      ? expoSummary.success + webSummary.success > 0
      : expoSummary.success > 0;

    return res.json({
      success,
      summary: {
        expo: expoSummary,
        web: webSummary,
      },
    });
  } catch (err) {
    console.error("🔥 sendPush ERROR:", err);
    return res.status(500).json({ error: err.toString() });
  }
}
