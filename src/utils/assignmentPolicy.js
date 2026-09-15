export function isAutoAssignableCounselor(counselor) {
  return counselor?.role === "counselor";
}

export function chooseRoundRobinCounselor(counselors, lastCounselorId) {
  // 모든 상담사에게 한 건씩 배정한 뒤 처음으로 돌아간다.
  // 브라우저와 서버에서 동일한 순서가 되도록 ID 자체를 비교한다.
  const ordered = counselors.filter(isAutoAssignableCounselor).sort((a, b) => {
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });

  if (!lastCounselorId) return ordered[0];

  return (
    ordered.find((counselor) => counselor.id > lastCounselorId) ?? ordered[0]
  );
}
