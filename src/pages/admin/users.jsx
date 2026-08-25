import { useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import MainLayout from "../../layouts/MainLayout";
import "../../styles/adminUsers.css";

export default function AdminUsers({ role }) {
  const [staffUsers, setStaffUsers] = useState([]);
  const [appUsers, setAppUsers] = useState([]);
  const [selectedStaffRole, setSelectedStaffRole] = useState("admin");
  const [selectedAppUsers, setSelectedAppUsers] = useState([]);
  const [searchApp, setSearchApp] = useState("");
  const [loading, setLoading] = useState(false);

  if (role !== "admin") {
    return <div>접근 권한이 없습니다.</div>;
  }

  const deductCoupon = async (uid, couponId) => {
    if (!window.confirm("이 쿠폰을 차감하시겠습니까?")) return;

    try {
      await deleteDoc(doc(db, "app_users", uid, "coupons", couponId));
      setAppUsers((prev) =>
        prev.map((user) =>
          user.id === uid
            ? { ...user, coupons: user.coupons.filter((coupon) => coupon.id !== couponId) }
            : user
        )
      );
      alert("쿠폰이 차감되었습니다.");
    } catch (error) {
      console.error(error);
      alert("쿠폰 차감 실패");
    }
  };

  const loadStaffUsersByRole = async (targetRole) => {
    setSelectedStaffRole(targetRole);
    setLoading(true);

    try {
      const snap =
        targetRole === "user"
          ? await getDocs(collection(db, "users"))
          : await getDocs(
              query(collection(db, "users"), where("role", "==", targetRole))
            );

      const results = snap.docs
        .map((staffDoc) => ({
          id: staffDoc.id,
          ...staffDoc.data(),
          role: staffDoc.data().role || "user",
        }))
        .filter((user) => user.role === targetRole);

      setStaffUsers(results);
    } catch (error) {
      console.error(error);
      alert("유저 검색 실패");
    } finally {
      setLoading(false);
    }
  };

  const loadCoupons = async (userDoc) => {
    const couponSnap = await getDocs(
      collection(db, "app_users", userDoc.id, "coupons")
    );
    return {
      id: userDoc.id,
      ...userDoc.data(),
      coupons: couponSnap.docs.map((couponDoc) => ({
        id: couponDoc.id,
        ...couponDoc.data(),
      })),
    };
  };

  const loadAllAppUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "app_users"));
      setAppUsers(snap.docs.map((userDoc) => ({ id: userDoc.id, ...userDoc.data() })));
      setSelectedAppUsers([]);
    } catch (error) {
      console.error(error);
      alert("전체 고객을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const searchAppUsers = async () => {
    if (!searchApp.trim()) {
      await loadAllAppUsers();
      return;
    }

    setLoading(true);
    try {
      const appUserQuery = query(
        collection(db, "app_users"),
        where("nickname", "==", searchApp.trim())
      );
      const snap = await getDocs(appUserQuery);
      const results = await Promise.all(snap.docs.map(loadCoupons));
      setAppUsers(results);
      setSelectedAppUsers([]);
    } catch (error) {
      console.error(error);
      alert("일반 사용자 검색 실패");
    } finally {
      setLoading(false);
    }
  };

  const changeRole = async (uid, newRole) => {
    try {
      await updateDoc(doc(db, "users", uid), { role: newRole });
      setStaffUsers((prev) => prev.filter((user) => user.id !== uid));
      alert("권한이 변경되었습니다.");
    } catch (error) {
      console.error(error);
      alert("권한 변경 실패");
    }
  };

  const deleteStaffUser = async (uid) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;

    try {
      await deleteDoc(doc(db, "users", uid));
      setStaffUsers((prev) => prev.filter((user) => user.id !== uid));
    } catch (error) {
      console.error(error);
      alert("삭제 실패");
    }
  };

  const deleteAppUserRecords = async (uids) => {
    const refs = [];

    for (const uid of uids) {
      const couponSnap = await getDocs(collection(db, "app_users", uid, "coupons"));
      couponSnap.docs.forEach((couponDoc) => refs.push(couponDoc.ref));
      refs.push(doc(db, "app_users", uid));
    }

    for (let index = 0; index < refs.length; index += 450) {
      const batch = writeBatch(db);
      refs.slice(index, index + 450).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  };

  const deleteAppUser = async (uid) => {
    if (!window.confirm("이 고객을 삭제하시겠습니까?")) return;

    try {
      await deleteAppUserRecords([uid]);
      setAppUsers((prev) => prev.filter((user) => user.id !== uid));
      setSelectedAppUsers((prev) => prev.filter((id) => id !== uid));
    } catch (error) {
      console.error(error);
      alert("삭제 실패");
    }
  };

  const deleteSelectedAppUsers = async () => {
    if (selectedAppUsers.length === 0) {
      alert("삭제할 고객을 선택해주세요.");
      return;
    }

    if (!window.confirm(`선택한 고객 ${selectedAppUsers.length}명을 삭제하시겠습니까?`)) {
      return;
    }

    setLoading(true);
    try {
      await deleteAppUserRecords(selectedAppUsers);
      const deletedIds = new Set(selectedAppUsers);
      setAppUsers((prev) => prev.filter((user) => !deletedIds.has(user.id)));
      setSelectedAppUsers([]);
      alert("선택한 고객을 삭제했습니다.");
    } catch (error) {
      console.error(error);
      alert("선택 삭제에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const allAppUsersSelected =
    appUsers.length > 0 && appUsers.every((user) => selectedAppUsers.includes(user.id));

  const toggleAllAppUsers = () => {
    setSelectedAppUsers(
      allAppUsersSelected ? [] : appUsers.map((user) => user.id)
    );
  };

  const toggleAppUser = (uid) => {
    setSelectedAppUsers((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const roleLabelMap = {
    admin: "관리자",
    counselor: "상담사",
    expert: "전문가",
    user: "유저",
  };

  const staffRoleButtons = [
    { value: "admin", label: "관리자" },
    { value: "counselor", label: "상담사" },
    { value: "expert", label: "전문가" },
    { value: "user", label: "유저" },
  ];

  return (
    <MainLayout title="고객 및 권한 관리">
      <div className="admin-users-page">
        {loading && <div className="admin-loading">정보를 불러오는 중...</div>}

        <section className="admin-users-section">
          <h2>관리자·상담사·전문가 권한</h2>
          <div className="role-filter-row">
            {staffRoleButtons.map((roleOption) => (
              <button
                key={roleOption.value}
                type="button"
                onClick={() => loadStaffUsersByRole(roleOption.value)}
                className={selectedStaffRole === roleOption.value ? "selected" : ""}
              >
                {roleOption.label}
              </button>
            ))}
          </div>

          <p className="result-count">
            현재 보기: {roleLabelMap[selectedStaffRole]} ({staffUsers.length})
          </p>

          <div className="user-card-grid">
            {staffUsers.map((user) => (
              <article className="management-card" key={user.id}>
                <strong>{user.name || user.realName || "이름 없음"}</strong>
                <span>{user.email || "이메일 없음"}</span>
                <small>UID: {user.id}</small>
                <p>현재 권한: <strong>{user.role || "user"}</strong></p>

                <div className="management-actions">
                  <select value={user.role ?? ""} onChange={(event) => changeRole(user.id, event.target.value)}>
                    <option value="">권한 선택</option>
                    <option value="admin">admin</option>
                    <option value="counselor">counselor</option>
                    <option value="expert">expert</option>
                    <option value="user">user</option>
                  </select>

                  <button type="button" className="danger-btn" onClick={() => deleteStaffUser(user.id)}>
                    삭제
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-users-section customer-section">
          <div className="section-heading-row">
            <div>
              <h2>고객 관리</h2>
              <p>전체 고객을 불러오거나 닉네임으로 정확히 검색할 수 있습니다.</p>
            </div>
            <button type="button" onClick={loadAllAppUsers}>전체 고객 불러오기</button>
          </div>

          <div className="customer-search-row">
            <input
              type="search"
              placeholder="고객 닉네임"
              value={searchApp}
              onChange={(event) => setSearchApp(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && searchAppUsers()}
            />
            <button type="button" onClick={searchAppUsers}>검색</button>
          </div>

          <div className="bulk-action-bar">
            <label>
              <input
                type="checkbox"
                checked={allAppUsersSelected}
                onChange={toggleAllAppUsers}
                disabled={appUsers.length === 0}
              />
              전체 선택 ({appUsers.length}명)
            </label>
            <span>{selectedAppUsers.length}명 선택됨</span>
            <button
              type="button"
              className="danger-btn"
              onClick={deleteSelectedAppUsers}
              disabled={selectedAppUsers.length === 0 || loading}
            >
              선택 고객 삭제
            </button>
          </div>

          {appUsers.length === 0 ? (
            <p className="customer-empty">조회된 고객이 없습니다.</p>
          ) : (
            <div className="customer-list">
              {appUsers.map((user) => (
                <article
                  className={`management-card customer-card ${selectedAppUsers.includes(user.id) ? "selected" : ""}`}
                  key={user.id}
                >
                  <label className="customer-select-label">
                    <input
                      type="checkbox"
                      checked={selectedAppUsers.includes(user.id)}
                      onChange={() => toggleAppUser(user.id)}
                    />
                    <strong>{user.nickname || "닉네임 없음"}</strong>
                  </label>
                  <span>이름: {user.name || "없음"}</span>
                  <span>전화번호: {user.phone || "없음"}</span>
                  <small>UID: {user.id}</small>

                  {user.coupons?.length > 0 && (
                    <div className="coupon-list">
                      <strong>보유 쿠폰</strong>
                      {user.coupons.map((coupon) => (
                        <div className="coupon-row" key={coupon.id}>
                          <span>
                            {coupon.type === "consult_support" && "상담지원 쿠폰"}
                            {coupon.type === "lawyer_fee_30" && "선임료 30% 지원"}
                            {coupon.type === "lawyer_fee_50" && "선임료 50% 지원"}
                          </span>
                          <button type="button" onClick={() => deductCoupon(user.id, coupon.id)}>차감</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button type="button" className="danger-btn customer-delete-btn" onClick={() => deleteAppUser(user.id)}>
                    고객 삭제
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </MainLayout>
  );
}
