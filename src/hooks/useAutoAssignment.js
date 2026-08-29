import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { db } from "../config/firebase";
import {
  assignWaitingConsultation,
  AUTO_ASSIGNMENT_SETTINGS_REF,
  isAutoAssignableCounselor,
  notifyAssignedCounselor,
} from "../utils/assignment";

export default function useAutoAssignment({ adminUid, isAdmin }) {
  const [modeSetting, setModeSetting] = useState({
    adminUid: null,
    enabled: false,
  });
  const [counselors, setCounselors] = useState([]);
  const [waitingRequests, setWaitingRequests] = useState([]);
  const queueRef = useRef(Promise.resolve());
  const queuedRequestIdsRef = useRef(new Set());
  const generationRef = useRef(0);
  const modeEnabled = Boolean(
    isAdmin &&
      adminUid &&
      modeSetting.adminUid === adminUid &&
      modeSetting.enabled
  );

  useEffect(() => {
    if (!isAdmin || !adminUid) {
      return undefined;
    }

    return onSnapshot(
      AUTO_ASSIGNMENT_SETTINGS_REF,
      (snapshot) =>
        setModeSetting({
          adminUid,
          enabled: snapshot.exists() && snapshot.data().enabled === true,
        }),
      (error) => {
        console.error("자동배정 설정 감시 실패:", error);
        setModeSetting({ adminUid, enabled: false });
      }
    );
  }, [adminUid, isAdmin]);

  useEffect(() => {
    generationRef.current += 1;

    if (!isAdmin || !adminUid || !modeEnabled) {
      return undefined;
    }

    const counselorQuery = query(
      collection(db, "users"),
      where("role", "==", "counselor")
    );
    const waitingQuery = query(
      collection(db, "consult_requests"),
      where("status", "==", "waiting")
    );

    const unsubscribeCounselors = onSnapshot(
      counselorQuery,
      (snapshot) => {
        setCounselors(
          snapshot.docs
            .map((counselorDoc) => ({
              id: counselorDoc.id,
              ...counselorDoc.data(),
            }))
            .filter(isAutoAssignableCounselor)
        );
      },
      (error) => console.error("자동배정 상담사 감시 실패:", error)
    );
    const unsubscribeRequests = onSnapshot(
      waitingQuery,
      (snapshot) => {
        setWaitingRequests(
          snapshot.docs.map((requestDoc) => ({
            id: requestDoc.id,
            ...requestDoc.data(),
          }))
        );
      },
      (error) => console.error("자동배정 대기 상담 감시 실패:", error)
    );

    return () => {
      unsubscribeCounselors();
      unsubscribeRequests();
    };
  }, [adminUid, isAdmin, modeEnabled]);

  useEffect(() => {
    if (
      !isAdmin ||
      !adminUid ||
      !modeEnabled ||
      counselors.length === 0 ||
      waitingRequests.length === 0
    ) {
      return;
    }

    const generation = generationRef.current;

    waitingRequests.forEach((request) => {
      if (queuedRequestIdsRef.current.has(request.id)) return;
      queuedRequestIdsRef.current.add(request.id);

      queueRef.current = queueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (generation !== generationRef.current) return;

          const result = await assignWaitingConsultation({
            requestId: request.id,
            request,
            counselors,
            assignedBy: adminUid,
            assignmentMode: "automatic",
          });

          if (result.assigned) {
            try {
              await notifyAssignedCounselor(request.id, result);
            } catch (pushError) {
              console.warn(`상담 요청 ${request.id} 자동배정 알림 실패:`, pushError);
            }
          } else if (result.reason === "missing-client-id") {
            console.warn(`상담 요청 ${request.id}에 사용자 UID가 없어 자동배정하지 못했습니다.`);
          }
        })
        .catch((error) => {
          console.error(`상담 요청 ${request.id} 자동배정 실패:`, error);
        })
        .finally(() => {
          queuedRequestIdsRef.current.delete(request.id);
        });
    });
  }, [adminUid, counselors, isAdmin, modeEnabled, waitingRequests]);
}
