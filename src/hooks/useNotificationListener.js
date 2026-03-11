import { useEffect, useState, useCallback } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";

/**
 * 🔔 알림 리스너 훅
 * - 항상 동일한 shape 반환 (React 안전)
 * - 웹 / 앱 공용
 * - markAsRead / markAllAsRead는 항상 함수
 */
export default function useNotifications(user) {
  const [notifications, setNotifications] = useState([]);

  /* --------------------------------------------------
     🛡️ noop (user 없을 때도 함수 보장)
  -------------------------------------------------- */
  const noop = useCallback(async () => {}, []);

  /* --------------------------------------------------
     🔹 단일 알림 읽음 처리
  -------------------------------------------------- */
  const markAsRead = useCallback(
    async (id) => {
      if (!user?.uid || !id) return;

      try {
        await updateDoc(doc(db, "notifications", id), {
          read: true,
        });
      } catch (e) {
        console.error("❌ markAsRead 실패:", e);
      }
    },
    [user]
  );

  /* --------------------------------------------------
     🔹 모든 알림 읽음 처리
  -------------------------------------------------- */
  const markAllAsRead = useCallback(async () => {
    if (!user?.uid || notifications.length === 0) return;

    try {
      const batch = writeBatch(db);

      notifications.forEach((n) => {
        if (!n.read) {
          batch.update(doc(db, "notifications", n.id), {
            read: true,
          });
        }
      });

      await batch.commit();
    } catch (e) {
      console.error("❌ markAllAsRead 실패:", e);
    }
  }, [user, notifications]);

  /* --------------------------------------------------
     🔹 알림 실시간 구독
  -------------------------------------------------- */
  useEffect(() => {
    // 🔥 user 없을 때도 항상 동일한 shape 유지
    if (!user?.uid || !user?.role) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(db, "notifications"),
      where("targetUid", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setNotifications(list);
      },
      (err) => {
        console.error("❌ notifications snapshot 에러:", err);
      }
    );

    return () => unsub();
  }, [user]);

  /* --------------------------------------------------
     🔚 항상 동일한 shape 반환 (🔥 핵심)
  -------------------------------------------------- */
  return {
    notifications,
    markAsRead: user ? markAsRead : noop,
    markAllAsRead: user ? markAllAsRead : noop,
  };
}



