import { fromStroops, toStroops } from "./amount";

/** Paid orders the seller still has, or already kept. Refunds and unpaid orders are left out. */
const COUNTED = new Set(["paid", "shipped", "completed", "disputed", "refund-approved", "resolved"]);

export function isCountedSale(status: string): boolean {
  return COUNTED.has(status);
}

export function salesVolume(orders: { status: string; total: string }[]): string {
  let sum = 0n;
  for (const order of orders) {
    if (!COUNTED.has(order.status)) continue;
    try {
      sum += toStroops(order.total);
    } catch {
      // Skip a malformed total rather than hiding the rest of the volume.
    }
  }
  return fromStroops(sum);
}

export function salesCount(orders: { status: string }[]): number {
  return orders.filter((order) => COUNTED.has(order.status)).length;
}
