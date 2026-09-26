import admin from "firebase-admin";
import { parseContractAmount } from "../src/utils/lawyerContractAmount.js";
import { isActiveProfile, isDeletedProfile } from "../server/lawyerDirectory.js";

const DOCUMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function getDatabase() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return admin.firestore();
}

async function requireAdmin(req, db) {
  const match = String(req.headers.authorization ?? "").match(/^Bearer\s+(.+)$/i);
  if (!match) throw httpError(401, "관리자 로그인이 필요합니다.");
  let token;
  try {
    token = await admin.auth().verifyIdToken(match[1], true);
  } catch {
    throw httpError(401, "로그인 정보가 만료되었습니다. 다시 로그인해 주세요.");
  }
  const account = await db.doc(`users/${token.uid}`).get();
  if (token.admin !== true && account.data()?.role !== "admin") {
    throw httpError(403, "관리자만 변호사 가입 신청을 관리할 수 있습니다.");
  }
  return token.uid;
}

function iso(value) {
  const date = typeof value?.toDate === "function" ? value.toDate() : value;
  return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function pick(data, fields) {
  return Object.fromEntries(fields.map((field) => [field, data?.[field] ?? null]));
}

function summary(uid, account, application) {
  return {
    uid,
    ...pick(application, ["name", "username", "email", "phone", "office"]),
    status: application?.status ?? account.lawyerStatus ?? "draft",
    applicationExists: Boolean(application),
    submittedAt: iso(application?.submittedAt),
    createdAt: iso(application?.createdAt ?? account.createdAt),
    updatedAt: iso(application?.updatedAt),
  };
}

async function listApplications(db) {
  const accounts = await db.collection("users").where("lawyerApplicant", "==", true).get();
  const applications = [];
  // Bound each read batch while retaining complete search/filter results in the UI.
  for (let offset = 0; offset < accounts.docs.length; offset += 100) {
    const batch = accounts.docs.slice(offset, offset + 100);
    const records = await db.getAll(...batch.map(({ id }) => db.doc(`app_users/${id}/private/lawyerApplication`)));
    records.forEach((record, index) => {
      applications.push(summary(batch[index].id, batch[index].data(), record.data()));
    });
  }
  applications.sort((a, b) => (b.submittedAt ?? b.createdAt ?? "").localeCompare(a.submittedAt ?? a.createdAt ?? ""));
  return { applications };
}

async function readApplication(db, uid) {
  const [account, application, identity, contract, profile] = await db.getAll(
    db.doc(`users/${uid}`),
    db.doc(`app_users/${uid}/private/lawyerApplication`),
    db.doc(`app_users/${uid}/private/identity`),
    db.doc(`lawyer_contracts/${uid}`),
    db.doc(`lawyers/${uid}`),
  );
  if (!account.exists || !application.exists) throw httpError(404, "가입 신청서를 찾을 수 없습니다.");
  return { account: account.data(), application: application.data(), identity: identity.data() ?? {},
    contract: contract.data(), profile: profile.data() };
}

function detail(uid, { account, application, identity, contract, profile }) {
  const evidence = application.evidence;
  const verified = Boolean(identity.verifiedAt && (
    (typeof identity.ci === "string" && identity.ci.trim()) ||
    (typeof identity.diHash === "string" && /^[a-f0-9]{64}$/.test(identity.diHash))
  ));
  const matches = verified && application.name === identity.name && application.phone === identity.phone;
  const hasEvidence = Boolean(evidence && (
    (evidence.method === "bar_id" && evidence.registrationNumber && evidence.issueNumber) ||
    (["registration_certificate", "lawyer_id"].includes(evidence.method) && evidence.document?.storagePath)
  ));
  return {
    ...summary(uid, account, application),
    ...pick(application, ["birthDate", "gender", "examType", "examRound", "referralSource", "referringLawyer",
      "termsAccepted", "privacyAccepted", "termsVersion", "rejectionReason", "reviewedBy"]),
    agreedAt: iso(application.agreedAt),
    reviewedAt: iso(application.reviewedAt),
    role: account.role ?? "user",
    identity: { ...pick(identity, ["name", "phone"]), verified, matches, verifiedAt: iso(identity.verifiedAt) },
    evidence: evidence ? {
      ...pick(evidence, ["method", "name", "birthDate", "qualificationStatus", "office", "officeAddress",
        "issuedDate", "registrationNumber", "issueNumber"]),
      hasDocument: Boolean(evidence.document?.storagePath),
      contentType: evidence.document?.contentType ?? null,
    } : null,
    canApprove: application.status === "pending" && hasEvidence &&
      (!evidence.name || evidence.name === application.name) &&
      (!evidence.birthDate || evidence.birthDate === application.birthDate),
    canEditContract: application.status === "approved" && account.role === "lawyer",
    contractAmount: parseContractAmount(contract?.contractAmount),
    profileExists: profile?.applicantUid === uid,
    profileActive: profile?.applicantUid === uid && isActiveProfile(profile),
    profileDeleted: Boolean(profile && isDeletedProfile(profile)),
    // CI and private storage paths never leave this endpoint.
  };
}

function validUid(uid) {
  return typeof uid === "string" && uid.trim() && uid.length <= 128 && !/[/\\]/.test(uid) && ![".", ".."].includes(uid);
}

async function saveContract(req, db, adminUid) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { throw httpError(400, "요청 내용을 확인해 주세요."); }
  }
  const { uid, contractAmount } = body ?? {};
  const amount = parseContractAmount(contractAmount);
  if (!validUid(uid)) throw httpError(400, "신청자 정보를 확인해 주세요.");
  if (amount === null) throw httpError(400, "계약금은 0원 이상 1조원 이하의 정수로 입력해 주세요.");
  await db.runTransaction(async (tx) => {
    const profileRef = db.doc(`lawyers/${uid}`);
    const contractRef = db.doc(`lawyer_contracts/${uid}`);
    const [account, application, profile, contract] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`app_users/${uid}/private/lawyerApplication`)),
      tx.get(profileRef), tx.get(contractRef),
    ]);
    if (!account.exists || !application.exists) throw httpError(404, "가입 신청서를 찾을 수 없습니다.");
    if (application.data().status !== "approved" || account.data().role !== "lawyer") {
      throw httpError(409, "승인된 변호사 회원만 계약금을 입력할 수 있습니다.");
    }
    if (profile.exists && profile.data().applicantUid !== uid) {
      throw httpError(409, "이미 등록된 프로필과 연결 정보를 확인해 주세요.");
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    if (!profile.exists) {
      const { name, office } = application.data();
      if (typeof name !== "string" || !name.trim() || typeof office !== "string" || !office.trim()) {
        throw httpError(409, "신청서의 이름과 소속 사무소를 확인해 주세요.");
      }
      tx.set(profileRef, {
        applicantUid: uid, name, office, nameSearch: name.toLocaleLowerCase("ko"),
        officeSearch: office.toLocaleLowerCase("ko"), region: "", regionSearch: "", careerSummary: "",
        photoUrl: "", photoPath: "", matchCount: 0, isActive: true, createdAt: now, updatedAt: now,
      });
    }
    tx.set(contractRef, { lawyerId: uid, contractAmount: amount, updatedAt: now, updatedBy: adminUid,
      ...(!contract.exists ? { createdAt: now } : {}) }, { merge: true });
  });
  return { uid, contractAmount: amount };
}

async function documentLink(uid, application) {
  const document = application.evidence?.document;
  const prefix = `lawyer-verifications/${uid}/`;
  const path = document?.storagePath;
  if (!path) throw httpError(404, "첨부된 증빙 파일이 없습니다.");
  const filename = typeof path === "string" && path.startsWith(prefix) ? path.slice(prefix.length) : "";
  if (!filename || filename.includes("/") || filename.includes("\\") || [".", ".."].includes(filename) ||
      !DOCUMENT_TYPES.has(document.contentType)) {
    throw httpError(400, "증빙 파일 정보를 확인할 수 없습니다.");
  }
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw httpError(503, "증빙 저장소 설정이 필요합니다. FIREBASE_STORAGE_BUCKET을 확인해 주세요.");
  const file = admin.storage().bucket(bucketName).file(path);
  const [exists] = await file.exists();
  if (!exists) throw httpError(404, "증빙 파일을 찾을 수 없습니다. 다시 제출받아 주세요.");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const [url] = await file.getSignedUrl({
    version: "v4", action: "read", expires: expiresAt,
    responseType: document.contentType,
    responseDisposition: "inline",
  });
  return { url, contentType: document.contentType, expiresAt: expiresAt.toISOString() };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    if (!["GET", "PATCH"].includes(req.method)) {
      res.setHeader("Allow", "GET, PATCH");
      throw httpError(405, "지원하지 않는 요청입니다.");
    }
    // Reject unauthenticated requests even if server credentials are not configured.
    if (!req.headers.authorization) throw httpError(401, "관리자 로그인이 필요합니다.");
    const db = getDatabase();
    const adminUid = await requireAdmin(req, db);
    if (req.method === "PATCH") return res.status(200).json(await saveContract(req, db, adminUid));
    const { uid, document } = req.query ?? {};
    if (uid === undefined && document === undefined) return res.status(200).json(await listApplications(db));
    if (!validUid(uid) ||
        (document !== undefined && document !== "1")) {
      throw httpError(400, "조회할 신청자 정보를 확인해 주세요.");
    }
    const record = await readApplication(db, uid);
    if (document === "1") return res.status(200).json(await documentLink(uid, record.application));
    return res.status(200).json({ application: detail(uid, record) });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status === 500) console.error("변호사 신청 처리 실패:", error.code ?? error.name);
    return res.status(status).json({ error: status === 500 ? "변호사 신청 처리에 실패했습니다. 서버 설정을 확인해 주세요." : error.message });
  }
}
