export type ZmOperator = "Airtel" | "MTN" | "Zamtel";

const PREFIXES: Record<string, ZmOperator> = {
  "097": "Airtel",
  "077": "Airtel",
  "096": "MTN",
  "076": "MTN",
  "095": "Zamtel",
  "075": "Zamtel",
};

/** Local 10-digit form, 0 plus 9 digits, or null when it is not complete yet. */
export function zambiaLocalNumber(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("260")) digits = digits.slice(3);
  if (digits.length === 9) digits = `0${digits}`;
  if (!/^0\d{9}$/.test(digits)) return null;
  return digits;
}

/** Reads the first three digits, including while the rest of the number is still being typed. */
export function detectZmOperator(input: string): ZmOperator | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("260")) digits = digits.slice(3);
  if (!digits.startsWith("0") && digits.length > 0) digits = `0${digits}`;
  return PREFIXES[digits.slice(0, 3)] ?? null;
}
