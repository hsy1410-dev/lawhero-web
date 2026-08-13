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

    let unsubscribeForeground;
    let cancelled = false;

    const notificationUrl = (data = {}) => {
      if (data.type === "consult" && data.consultId) {
        return `/admin/consult/${data.consultId}`;
      }
      if (data.type === "chat" && data.consultId && user.role === "counselor") {
        return `/counselor/chat/${data.consultId}`;
      }
      if (data.type === "assign") return "/counselor/dashboard";
      return user.role === "admin" ? "/admin" : "/counselor/dashboard";
    };

    async function setup() {
      try {
        const supported = await isSupported();
        if (!supported || !("serviceWorker" in navigator)) return;
        if (Notification.permission !== "granted") return;

        const registration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js"
        );
        const messagingInstance = getMessaging(app);
        const token = await getToken(messagingInstance, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (!token || cancelled) return;

        const ref = doc(db, "fcmTokens", user.uid);
        await setDoc(
          ref,
          {
            role: user.role,
            updatedAt: new Date(),
            tokens: { [token]: true },
          },
          { merge: true }
        );

        if (unsubscribeForeground) unsubscribeForeground();
        unsubscribeForeground = onMessage(messagingInstance, (payload) => {
          const data = payload.data || {};
          const title = data.title || payload.notification?.title || "Law Hero 알림";
          const body = data.body || payload.notification?.body || "새 알림이 도착했습니다.";

          registration.showNotification(title, {
            body,
            icon: "/heart.png",
            badge: "/heart.png",
            tag: `lawhero-${data.type || "notification"}-${data.consultId || Date.now()}`,
            renotify: true,
            silent: false,
            vibrate: [200, 100, 200],
            data: { url: data.url || notificationUrl(data) },
          });
        });
      } catch (error) {
        console.error("FCM 설정 실패:", error);
      }
    }

    setup();
    window.addEventListener("lawhero:enable-notifications", setup);

    return () => {
      cancelled = true;
      window.removeEventListener("lawhero:enable-notifications", setup);
      if (unsubscribeForeground) unsubscribeForeground();
    };
  }, [user]);
}
