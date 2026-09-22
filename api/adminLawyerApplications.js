import admin from "firebase-admin";

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
    throw httpError(403, "관리자만 변호사 가입 신청을 조회할 수 있습니다.");
  }
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
  const [account, application, identity] = await db.getAll(
    db.doc(`users/${uid}`),
    db.doc(`app_users/${uid}/private/lawyerApplication`),
    db.doc(`app_users/${uid}/private/identity`),
  );
  if (!account.exists || !application.exists) throw httpError(404, "가입 신청서를 찾을 수 없습니다.");
  return { account: account.data(), application: application.data(), identity: identity.data() ?? {} };
}

function detail(uid, { account, application, identity }) {
  const evidence = application.evidence;
  const verified = Boolean(identity.ci && identity.verifiedAt);
  const matches = verified && application.name === identity.name && application.phone === identity.phone;
  const hasEvidence = Boolean(evidence && (
    evidence.method === "bar_id" ||
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
    canApprove: application.status === "pending" && matches && hasEvidence,
    // CI and private storage paths never leave this endpoint.
  };
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
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      throw httpError(405, "지원하지 않는 요청입니다.");
    }
    // Reject unauthenticated requests even if server credentials are not configured.
    if (!req.headers.authorization) throw httpError(401, "관리자 로그인이 필요합니다.");
    const db = getDatabase();
    await requireAdmin(req, db);
    const { uid, document } = req.query ?? {};
    if (uid === undefined && document === undefined) return res.status(200).json(await listApplications(db));
    if (typeof uid !== "string" || !uid.trim() || uid.length > 128 || /[/\\]/.test(uid) || [".", ".."].includes(uid) ||
        (document !== undefined && document !== "1")) {
      throw httpError(400, "조회할 신청자 정보를 확인해 주세요.");
    }
    const record = await readApplication(db, uid);
    if (document === "1") return res.status(200).json(await documentLink(uid, record.application));
    return res.status(200).json({ application: detail(uid, record) });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status === 500) console.error("변호사 신청 조회 실패:", error.code ?? error.name);
    return res.status(status).json({ error: status === 500 ? "변호사 신청 조회에 실패했습니다. 서버 설정을 확인해 주세요." : error.message });
  }
}
