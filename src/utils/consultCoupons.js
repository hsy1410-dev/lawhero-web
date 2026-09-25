export function isUsableConsultCoupon(coupon, time = Date.now()) {
  const expires = coupon.expiredAt ?? coupon.expiresAt;
  return coupon.type === "consult_support" && coupon.used === false && !coupon.revokedAt
    && (!expires || (typeof expires.toMillis === "function" && expires.toMillis() > time));
}
