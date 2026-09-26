import admin from "firebase-admin";
import { getMatchCount } from "../src/utils/lawyerMatchCount.js";
import { directoryAccount, isActiveProfile, readDirectoryAccounts } from "../server/lawyerDirectory.js";

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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET 요청만 지원합니다." });
  }

  try {
    const keyword = cleanQueryValue(req.query.q);
    const name = cleanQueryValue(req.query.name);
    const region = cleanQueryValue(req.query.region);
    const office = cleanQueryValue(req.query.office);
    const requestedPage = Number(
      Array.isArray(req.query.page) ? req.query.page[0] : req.query.page
    );
    const page = Number.isInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
    const pageSize = 10;

    const [profileSnap, contractSnap] = await Promise.all([
      db.collection("lawyers").get(),
      db.collection("lawyer_contracts").get(),
    ]);
    const contractById = new Map(
      contractSnap.docs.map((contractDoc) => [
        contractDoc.id,
        Number(contractDoc.data().contractAmount ?? 0),
      ])
    );

    const accounts = await readDirectoryAccounts(db, profileSnap.docs);
    const matchedLawyers = profileSnap.docs
      .filter((entry) => {
        const account = directoryAccount(entry, accounts);
        return isActiveProfile(entry.data()) && account.exists;
      })
      .map((profileDoc) => {
        const profile = profileDoc.data();
        return {
          id: profileDoc.id,
          name: profile.name ?? "",
          region: profile.region ?? "",
          office: profile.office ?? "",
          careerSummary: profile.careerSummary ?? "",
          matchCount: getMatchCount(profile.matchCount),
          photoUrl: profile.photoUrl ?? "",
          canMatch: directoryAccount(profileDoc, accounts).approved,
          updatedAt: timestampToIso(profile.updatedAt),
          _contractAmount: contractById.get(profileDoc.id) ?? 0,
        };
      })
      .filter((lawyer) => {
        const searchableName = lawyer.name.toLocaleLowerCase("ko");
        const searchableRegion = lawyer.region.toLocaleLowerCase("ko");
        const searchableOffice = lawyer.office.toLocaleLowerCase("ko");
        const matchesKeyword =
          !keyword ||
          [searchableName, searchableRegion, searchableOffice].some((value) =>
            value.includes(keyword)
          );

        return (
          matchesKeyword &&
          (!name || searchableName.includes(name)) &&
          (!region || searchableRegion.includes(region)) &&
          (!office || searchableOffice.includes(office))
        );
      })
      .sort((a, b) => {
        const amountDifference = b._contractAmount - a._contractAmount;
        if (amountDifference !== 0) return amountDifference;
        return a.name.localeCompare(b.name, "ko");
      });

    const totalCount = matchedLawyers.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const currentPage = Math.min(page, Math.max(totalPages, 1));
    const startIndex = (currentPage - 1) * pageSize;
    const pageProfiles = matchedLawyers.slice(startIndex, startIndex + pageSize);
    const lawyers = pageProfiles
      .map((lawyer) => ({
        id: lawyer.id,
        name: lawyer.name,
        region: lawyer.region,
        office: lawyer.office,
        careerSummary: lawyer.careerSummary,
        matchCount: lawyer.matchCount,
        photoUrl: lawyer.photoUrl,
        updatedAt: lawyer.updatedAt,
        canMatch: lawyer.canMatch,
      }));

    return res.status(200).json({
      lawyers,
      count: lawyers.length,
      pagination: {
        page: currentPage,
        pageSize,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message, code: error.code });
    console.error("변호사 검색 API 오류:", error);
    return res.status(500).json({ error: "변호사 목록을 불러오지 못했습니다." });
  }
}
