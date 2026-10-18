import { fromStroops, toStroops } from "./amount";

/** Share of each cash out kept by the marketplace. */
export const PLATFORM_FEE_PERCENT = 5;

export function sumAmounts(amounts: string[]): string {
  let sum = 0n;
  for (const amount of amounts) {
    try {
      sum += toStroops(amount);
    } catch {
      // Skip a malformed amount.
    }
  }
  return fromStroops(sum);
}

export function platformFee(amount: string): { fee: string; net: string } {
  const gross = toStroops(amount);
  const fee = (gross * BigInt(PLATFORM_FEE_PERCENT)) / 100n;
  const net = gross - fee;
  return { fee: fromStroops(fee), net: fromStroops(net > 0n ? net : 0n) };
}

/** What is still in Lenco after cash outs. Never negative. */
export function availableBalance(volume: string, paidOut: string): string {
  let left = 0n;
  try {
    left = toStroops(volume) - toStroops(paidOut);
  } catch {
    return "0";
  }
  return fromStroops(left > 0n ? left : 0n);
}
