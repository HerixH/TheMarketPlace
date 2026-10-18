import "server-only";
import { withDb } from "./db";
import type { ZmOperator } from "../zm-mobile";

export interface ResolvedAccount {
  accountName: string;
  operator: ZmOperator;
}

/** Reads the registered mobile-money name. Uses Lenco when a key is set, otherwise a name already paid to this number, then the signed-in profile. */
export async function resolveMobileMoney(input: {
  phone: string;
  operator: ZmOperator;
  profileName: string;
}): Promise<ResolvedAccount> {
  const fromLenco = await resolveWithLenco(input.phone, input.operator);
  if (fromLenco) return { accountName: fromLenco, operator: input.operator };

  const prior = await withDb((db) => db.payouts.find((payout) => payout.accountNumber === input.phone)?.accountName);
  if (prior) return { accountName: prior, operator: input.operator };

  return { accountName: input.profileName, operator: input.operator };
}

async function resolveWithLenco(phone: string, operator: ZmOperator): Promise<string | null> {
  const key = process.env.LENCO_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.lenco.co/access/v2/resolve/mobile-money", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ phone, operator: operator.toLowerCase(), country: "zm" }),
    });
    const body = (await res.json()) as { status?: boolean; data?: { accountName?: string } };
    const name = body.status ? body.data?.accountName?.trim() : "";
    return name || null;
  } catch {
    return null;
  }
}
