const STROOPS = 10_000_000n;

/** "12.5" -> 125000000n. Throws on invalid input or more than 7 decimals. */
export function toStroops(value: string): bigint {
  const v = value.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(v)) throw new Error("Invalid USDC amount");
  const [whole, frac = ""] = v.split(".");
  return BigInt(whole) * STROOPS + BigInt(frac.padEnd(7, "0"));
}

/** 125000000n -> "12.5" */
export function fromStroops(stroops: bigint): string {
  const whole = stroops / STROOPS;
  const frac = (stroops % STROOPS).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function isValidPrice(value: string): boolean {
  try {
    return toStroops(value) > 0n;
  } catch {
    return false;
  }
}

export function multiplyPrice(price: string, quantity: number): string {
  return fromStroops(toStroops(price) * BigInt(quantity));
}

export function formatUsdc(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 7 });
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}
