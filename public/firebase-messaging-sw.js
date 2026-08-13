/* eslint-disable */
importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDnN9tfki8ldnN28QjybseGONhC-PAyKu8",
  authDomain: "lawheroapp.firebaseapp.com",
  projectId: "lawheroapp",
  messagingSenderId: "364669680330",
  appId: "1:364669680330:web:15470fb61897f1fe43d233",
});

const messaging = firebase.messaging();

/* ----------------------------------------------------
   ✔ FCM Background Handler (기본)
---------------------------------------------------- */
messaging.onBackgroundMessage((payload) => {
  console.log("[SW] onBackgroundMessage:", payload);

  const data = payload.data || {};
  const title = data.title || payload.notification?.title || "Law Hero 알림";
  const options = {
    body: data.body || payload.notification?.body || "새 알림이 도착했습니다.",
    icon: "/heart.png",
    badge: "/heart.png",
    tag: `lawhero-${data.type || "notification"}-${data.consultId || Date.now()}`,
    requireInteraction: data.type === "consult",
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" },
  };

  return self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const sameOriginClient = clientList.find((client) =>
        client.url.startsWith(self.location.origin)
      );

      if (sameOriginClient) {
        return sameOriginClient.focus().then((client) => client.navigate(targetUrl));
      }

      return clients.openWindow(targetUrl);
    })
  );
});
