export function linkedAccountUid(profile) {
  return [profile.applicantUid, profile.uid, profile.userId]
    .find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

export function isDeletedProfile(profile) {
  return Boolean(profile.deletedAt || profile.isDeleted === true);
}

export function isActiveProfile(profile) {
  return !isDeletedProfile(profile) && profile.isActive !== false && profile.active !== false;
}

// Names are not unique: resolve public profiles and private documents by UID only.
export async function readDirectoryAccounts(db, profiles) {
  const uids = [...new Set(profiles.map((entry) => linkedAccountUid(entry.data()) || entry.id))]
    .filter((uid) => uid && !/[/\\]/.test(uid) && ![".", ".."].includes(uid));
  const accounts = new Map();
  for (let offset = 0; offset < uids.length; offset += 100) {
    const batch = uids.slice(offset, offset + 100);
    const records = await db.getAll(...batch.flatMap((uid) => [
      db.doc(`users/${uid}`), db.doc(`app_users/${uid}`), db.doc(`lawyer_badges/${uid}`),
    ]));
    batch.forEach((uid, index) => {
      const [web, app, badge] = records.slice(index * 3, index * 3 + 3);
      accounts.set(uid, { web: web.data(), app: app.data(), badge: badge.data() });
    });
  }
  return accounts;
}

export function directoryAccount(entry, accounts) {
  const explicitUid = linkedAccountUid(entry.data());
  const uid = explicitUid || entry.id;
  const account = accounts.get(uid) ?? {};
  const linked = Boolean(explicitUid || account.web || account.app || account.badge);
  return {
    uid: linked ? uid : "",
    // Manual profiles need no account. Orphaned member profiles disappear
    // immediately, without waiting for asynchronous cleanup functions.
    exists: !linked || Boolean(account.web && account.app),
    approved: account.web?.role === "lawyer" && account.app?.role === "lawyer"
      && account.app?.lawyerStatus === "approved" && account.badge?.approved === true,
  };
}
