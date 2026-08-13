import { useState } from "react";

export default function PushNotificationButton({ role }) {
  const [permission, setPermission] = useState(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );

  if (!['admin', 'counselor'].includes(role) || permission === "unsupported") {
    return null;
  }

  const enableNotifications = async () => {
    if (permission === "denied") {
      alert("크롬 주소창의 사이트 설정에서 알림을 '허용'으로 바꿔주세요.");
      return;
    }

    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);

    if (nextPermission === "granted") {
      window.dispatchEvent(new Event("lawhero:enable-notifications"));
    }
  };

  return (
    <button
      type="button"
      className={`push-permission-btn ${permission}`}
      onClick={enableNotifications}
      aria-label="모바일 크롬 알림 설정"
    >
      {permission === "granted" ? "🔔 알림 켜짐" : permission === "denied" ? "🔕 알림 차단됨" : "🔔 알림 켜기"}
    </button>
  );
}
