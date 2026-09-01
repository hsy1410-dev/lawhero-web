import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

function cleanQueryValue(value) {
  const source = Array.isArray(value) ? value[0] : value;
  return typeof source === "string" ? source.trim().toLocaleLowerCase("ko").slice(0, 50) : "";
}

function timestampToIso(value) {
  return typeof value?.toDate === "function" ? value.toDate().toISOString() : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET 요청만 지원합니다." });
  }

  try {
    const name = cleanQueryValue(req.query.name);
    const region = cleanQueryValue(req.query.region);
    const requestedLimit = Number(Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 30;

    const [profileSnap, contractSnap] = await Promise.all([
      db.collection("lawyers").where("isActive", "==", true).get(),
      db.collection("lawyer_contracts").get(),
    ]);
    const contractById = new Map(
      contractSnap.docs.map((contractDoc) => [
        contractDoc.id,
        Number(contractDoc.data().contractAmount ?? 0),
      ])
    );

    const lawyers = profileSnap.docs
      .map((profileDoc) => {
        const profile = profileDoc.data();
        return {
          id: profileDoc.id,
          name: profile.name ?? "",
          region: profile.region ?? "",
          office: profile.office ?? "",
          careerSummary: profile.careerSummary ?? "",
          photoUrl: profile.photoUrl ?? "",
          updatedAt: timestampToIso(profile.updatedAt),
          _contractAmount: contractById.get(profileDoc.id) ?? 0,
        };
      })
      .filter((lawyer) => {
        const searchableName = lawyer.name.toLocaleLowerCase("ko");
        const searchableRegion = lawyer.region.toLocaleLowerCase("ko");
        return (!name || searchableName.includes(name)) && (!region || searchableRegion.includes(region));
      })
      .sort((a, b) => {
        const amountDifference = b._contractAmount - a._contractAmount;
        if (amountDifference !== 0) return amountDifference;
        return a.name.localeCompare(b.name, "ko");
      })
      .slice(0, limit)
      .map((lawyer) => ({
        id: lawyer.id,
        name: lawyer.name,
        region: lawyer.region,
        office: lawyer.office,
        careerSummary: lawyer.careerSummary,
        photoUrl: lawyer.photoUrl,
        updatedAt: lawyer.updatedAt,
      }));

    return res.status(200).json({ lawyers, count: lawyers.length });
  } catch (error) {
    console.error("변호사 검색 API 오류:", error);
    return res.status(500).json({ error: "변호사 목록을 불러오지 못했습니다." });
  }
}
