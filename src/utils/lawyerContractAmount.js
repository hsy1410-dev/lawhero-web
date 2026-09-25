export const MAX_CONTRACT_AMOUNT = 1_000_000_000_000;

export function parseContractAmount(value) {
  if ((typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !/^\d+$/.test(value.trim()))) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_CONTRACT_AMOUNT ? amount : null;
}
