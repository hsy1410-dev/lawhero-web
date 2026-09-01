import { randomUUID } from "node:crypto";
import admin from "firebase-admin";

const storageBucket =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.VITE_FIREBASE_STORAGE_BUCKET;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    ...(storageBucket ? { storageBucket } : {}),
  });
}

const db = admin.firestore();

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      throw createHttpError(400, "요청 내용을 확인해 주세요.");
    }
  }
  return req.body;
}

function cleanText(value, label, maxLength) {
  const cleaned = typeof value === "string" ? value.trim() : "";
  if (!cleaned) throw createHttpError(400, `${label}을(를) 입력해 주세요.`);
  if (cleaned.length > maxLength) {
    throw createHttpError(400, `${label}은(는) ${maxLength}자 이내로 입력해 주세요.`);
  }
  return cleaned;
}

function parseContractAmount(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000_000) {
    throw createHttpError(400, "계약금은 0원 이상 1조원 이하의 숫자로 입력해 주세요.");
  }
  return amount;
}

function validateLawyerInput(body) {
  return {
    name: cleanText(body.name, "변호사 이름", 50),
    region: cleanText(body.region, "지역", 40),
    office: cleanText(body.office, "소속 사무실", 100),
    careerSummary: cleanText(body.careerSummary, "간단 경력", 500),
    contractAmount: parseContractAmount(body.contractAmount),
    isActive: body.isActive !== false,
  };
}

async function authenticateAdmin(req) {
  const authorization = req.headers.authorization ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw createHttpError(401, "관리자 로그인이 필요합니다.");

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(match[1]);
  } catch {
    throw createHttpError(401, "로그인 정보가 만료되었습니다. 다시 로그인해 주세요.");
  }

  const userSnap = await db.collection("users").doc(decodedToken.uid).get();
  const role = String(userSnap.data()?.role ?? "").trim().toLowerCase();
  if (!userSnap.exists || role !== "admin") {
    throw createHttpError(403, "관리자만 변호사 정보를 관리할 수 있습니다.");
  }

  return decodedToken.uid;
}

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function serializeLawyer(profileDoc, contractById) {
  const profile = profileDoc.data();
  const contract = contractById.get(profileDoc.id) ?? {};

  return {
    id: profileDoc.id,
    name: profile.name ?? "",
    region: profile.region ?? "",
    office: profile.office ?? "",
    careerSummary: profile.careerSummary ?? "",
    photoUrl: profile.photoUrl ?? "",
    photoPath: profile.photoPath ?? "",
    isActive: profile.isActive !== false,
    contractAmount: Number(contract.contractAmount ?? 0),
    createdAt: timestampToIso(profile.createdAt),
    updatedAt: timestampToIso(profile.updatedAt),
  };
}

async function uploadPhoto(lawyerId, dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl) {
    throw createHttpError(400, "변호사 사진을 선택해 주세요.");
  }

  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !IMAGE_TYPES[match[1]]) {
    throw createHttpError(400, "JPG, PNG, WEBP 형식의 사진만 등록할 수 있습니다.");
  }

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw createHttpError(400, "사진은 2.5MB 이하로 등록해 주세요.");
  }

  const bucket = admin.storage().bucket();
  if (!bucket?.name) {
    throw createHttpError(500, "사진 저장소 설정을 확인해 주세요.");
  }

  const token = randomUUID();
  const photoPath = `lawyer-photos/${lawyerId}/${randomUUID()}.${IMAGE_TYPES[match[1]]}`;
  const file = bucket.file(photoPath);

  await file.save(buffer, {
    resumable: false,
    validation: "md5",
    metadata: {
      contentType: match[1],
      cacheControl: "public,max-age=31536000,immutable",
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const photoUrl =
    `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}` +
    `/o/${encodeURIComponent(photoPath)}?alt=media&token=${token}`;

  return { photoPath, photoUrl };
}

async function removePhoto(photoPath) {
  if (typeof photoPath !== "string" || !photoPath.startsWith("lawyer-photos/")) return;
  try {
    await admin.storage().bucket().file(photoPath).delete({ ignoreNotFound: true });
  } catch (error) {
    console.warn("이전 변호사 사진 삭제 실패:", error);
  }
}

async function listLawyers(res) {
  const [profileSnap, contractSnap] = await Promise.all([
    db.collection("lawyers").get(),
    db.collection("lawyer_contracts").get(),
  ]);
  const contractById = new Map(
    contractSnap.docs.map((contractDoc) => [contractDoc.id, contractDoc.data()])
  );
  const lawyers = profileSnap.docs
    .map((profileDoc) => serializeLawyer(profileDoc, contractById))
    .sort((a, b) => {
      const amountDifference = b.contractAmount - a.contractAmount;
      if (amountDifference !== 0) return amountDifference;
      return a.name.localeCompare(b.name, "ko");
    });

  return res.status(200).json({ lawyers, count: lawyers.length });
}

async function createLawyer(req, res, adminUid) {
  const body = parseBody(req);
  const input = validateLawyerInput(body);
  const profileRef = db.collection("lawyers").doc();
  const contractRef = db.collection("lawyer_contracts").doc(profileRef.id);
  let uploadedPhoto = null;

  try {
    uploadedPhoto = await uploadPhoto(profileRef.id, body.imageDataUrl);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    batch.set(profileRef, {
      name: input.name,
      nameSearch: input.name.toLocaleLowerCase("ko"),
      region: input.region,
      regionSearch: input.region.toLocaleLowerCase("ko"),
      office: input.office,
      careerSummary: input.careerSummary,
      photoUrl: uploadedPhoto.photoUrl,
      photoPath: uploadedPhoto.photoPath,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now,
    });
    batch.set(contractRef, {
      lawyerId: profileRef.id,
      contractAmount: input.contractAmount,
      createdAt: now,
      updatedAt: now,
      updatedBy: adminUid,
    });
    await batch.commit();

    return res.status(201).json({ id: profileRef.id, message: "변호사를 등록했습니다." });
  } catch (error) {
    if (uploadedPhoto?.photoPath) await removePhoto(uploadedPhoto.photoPath);
    throw error;
  }
}

async function updateLawyer(req, res, adminUid) {
  const body = parseBody(req);
  const lawyerId = cleanText(body.id, "변호사 ID", 200);
  const input = validateLawyerInput(body);
  const profileRef = db.collection("lawyers").doc(lawyerId);
  const contractRef = db.collection("lawyer_contracts").doc(lawyerId);
  const profileSnap = await profileRef.get();
  if (!profileSnap.exists) throw createHttpError(404, "변호사 정보를 찾을 수 없습니다.");

  const previousProfile = profileSnap.data();
  let uploadedPhoto = null;

  try {
    if (body.imageDataUrl) uploadedPhoto = await uploadPhoto(lawyerId, body.imageDataUrl);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    batch.set(
      profileRef,
      {
        name: input.name,
        nameSearch: input.name.toLocaleLowerCase("ko"),
        region: input.region,
        regionSearch: input.region.toLocaleLowerCase("ko"),
        office: input.office,
        careerSummary: input.careerSummary,
        isActive: input.isActive,
        ...(uploadedPhoto ?? {}),
        updatedAt: now,
      },
      { merge: true }
    );
    batch.set(
      contractRef,
      {
        lawyerId,
        contractAmount: input.contractAmount,
        updatedAt: now,
        updatedBy: adminUid,
      },
      { merge: true }
    );
    await batch.commit();

    if (uploadedPhoto && previousProfile.photoPath !== uploadedPhoto.photoPath) {
      await removePhoto(previousProfile.photoPath);
    }

    return res.status(200).json({ id: lawyerId, message: "변호사 정보를 수정했습니다." });
  } catch (error) {
    if (uploadedPhoto?.photoPath) await removePhoto(uploadedPhoto.photoPath);
    throw error;
  }
}

async function setLawyerVisibility(req, res, adminUid) {
  const body = parseBody(req);
  const lawyerId = cleanText(body.id, "변호사 ID", 200);
  if (typeof body.isActive !== "boolean") {
    throw createHttpError(400, "노출 상태를 확인해 주세요.");
  }

  const profileRef = db.collection("lawyers").doc(lawyerId);
  const profileSnap = await profileRef.get();
  if (!profileSnap.exists) throw createHttpError(404, "변호사 정보를 찾을 수 없습니다.");

  await profileRef.update({
    isActive: body.isActive,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: adminUid,
  });
  return res.status(200).json({ id: lawyerId, isActive: body.isActive });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  try {
    const adminUid = await authenticateAdmin(req);

    if (req.method === "GET") return await listLawyers(res);
    if (req.method === "POST") return await createLawyer(req, res, adminUid);
    if (req.method === "PUT") return await updateLawyer(req, res, adminUid);
    if (req.method === "PATCH") return await setLawyerVisibility(req, res, adminUid);

    res.setHeader("Allow", "GET, POST, PUT, PATCH");
    return res.status(405).json({ error: "지원하지 않는 요청입니다." });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error("변호사 관리 API 오류:", error);
    return res.status(status).json({
      error: status >= 500 ? "변호사 정보를 처리하는 중 서버 오류가 발생했습니다." : error.message,
    });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
};
