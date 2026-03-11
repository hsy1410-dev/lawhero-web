/* eslint-disable */
importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA7bvOCxqg_x9q__4vTrDIBo11sqrQ9pkU",
  authDomain: "newdb-d95cd.firebaseapp.com",
  projectId: "newdb-d95cd",
  messagingSenderId: "94139987393",
  appId: "1:94139987393:web:f32bf03fe0b96748efeb40",
});

const messaging = firebase.messaging();

/* ----------------------------------------------------
   ✔ FCM Background Handler (기본)
---------------------------------------------------- */
messaging.onBackgroundMessage((payload) => {
  console.log("[SW] onBackgroundMessage:", payload);

  const title = payload.notification?.title || "알림";
  const options = {
    body: payload.notification?.body || "",
    icon: "/icon-192.png",
    badge: "/icon-96.png",     // ⭐ OS 알림에 매우 중요!
  };

  self.registration.showNotification(title, options);
});

/* ----------------------------------------------------
   ✔ Chrome Push Event — 반드시 필요!!
   → 이것이 있어야 OS 알림으로 뜸
---------------------------------------------------- */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { notification: { title: "알림", body: event.data.text() } };
  }

  const title = payload.notification?.title || "알림";
  const options = {
    body: payload.notification?.body || "",
    icon: "/icon-192.png",
    badge: "/icon-96.png",
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      setTimeout(() => {
        self.registration.getNotifications().then((notifications) => {
          notifications.forEach((n) => n.close());
        });
      }, 5000); // 🔥 5초 후 자동 닫기
    })
  );
});
