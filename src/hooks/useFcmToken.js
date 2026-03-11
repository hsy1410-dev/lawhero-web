// src/hooks/useFcmToken.js
import { useEffect } from "react";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { app, db } from "../config/firebase";

export default function useFcmToken(user) {
  useEffect(() => {
    if (!user?.uid) return;

    async function setup() {
      const supported = await isSupported();
      if (!supported) return;

      let registration;
      if ("serviceWorker" in navigator) {
        registration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js"
        );
      } else {
        return;
      }

      const messagingInstance = getMessaging(app);

      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const token = await getToken(messagingInstance, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (!token) return;

      console.log("🔥 FCM Token:", token);

      // ✅ 🔥 반드시 uid 사용
      const ref = doc(db, "fcmTokens", user.uid);

      await setDoc(
        ref,
        {
          role: user.role,
          tokens: {
            [token]: true,
          },
        },
        { merge: true }
      );

      console.log("✅ 토큰 저장 완료");

      onMessage(messagingInstance, (payload) => {
        console.log("📩 포그라운드 푸시:", payload);
      });
    }

    setup();
  }, [user]);
}