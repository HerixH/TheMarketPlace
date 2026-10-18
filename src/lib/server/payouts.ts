import "server-only";
import { randomBytes } from "crypto";
import { isValidPrice, toStroops } from "../amount";
import { availableBalance, platformFee, PLATFORM_FEE_PERCENT, sumAmounts } from "../fees";
import { salesVolume } from "../sales";
import type { Payout, PayoutMethod } from "../types";
import { withDb, type DB } from "./db";
import { HttpError } from "./stellar";

export interface LencoBalance {
  salesVolume: string;
  paidOut: string;
  available: string;
  feePercent: number;
  payouts: Payout[];
}

export function lencoBalance(db: DB, seller: string): LencoBalance {
  const volume = salesVolume(db.orders.filter((order) => order.seller === seller));
  const payouts = db.payouts
    .filter((payout) => payout.seller === seller)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((payout) => ({
      ...payout,
      support: db.support
        .filter((item) => item.payoutId === payout.id)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((item) => ({
          message: item.message,
          createdAt: item.createdAt,
          reply: item.reply ?? null,
          repliedAt: item.repliedAt ?? null,
          status: item.status === "closed" ? ("closed" as const) : ("open" as const),
          closedAt: item.closedAt ?? null,
        })),
    }));
  const paidOut = sumAmounts(payouts.map((payout) => payout.amount));
  return {
    salesVolume: volume,
    paidOut,
    available: availableBalance(volume, paidOut),
    feePercent: PLATFORM_FEE_PERCENT,
    payouts,
  };
}

export async function readLencoBalance(seller: string): Promise<LencoBalance> {
  return withDb((db) => lencoBalance(db, seller));
}

export async function cashOut(input: {
  accountId: string;
  seller: string;
  amount: string;
  method: PayoutMethod;
  accountName: string;
  accountNumber: string;
  bankName: string;
}): Promise<LencoBalance> {
  if (!isValidPrice(input.amount)) throw new HttpError(400, "Enter an amount in USDC, for example 25 or 12.50");
  return withDb((db) => {
    const balance = lencoBalance(db, input.seller);
    const gross = input.amount.replace(/^0+(?=\d)/, "");
    if (toStroops(gross) > toStroops(balance.available)) {
      throw new HttpError(400, "That amount is higher than the USDC held in Lenco");
    }
    const split = platformFee(gross);
    if (toStroops(split.net) <= 0n) throw new HttpError(400, "That amount is too small after the platform fee");
    const payout: Payout = {
      id: randomBytes(8).toString("hex"),
      accountId: input.accountId,
      seller: input.seller,
      amount: gross,
      fee: split.fee,
      net: split.net,
      method: input.method,
      accountName: input.accountName,
      accountNumber: input.accountNumber,
      bankName: input.bankName,
      createdAt: new Date().toISOString(),
    };
    db.payouts.push(payout);
    return lencoBalance(db, input.seller);
  });
}
