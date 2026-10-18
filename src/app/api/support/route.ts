import { randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { handle, ok, readJson, str } from "@/lib/server/api";
import { currentAccount, rejectBanned } from "@/lib/server/auth";
import { withDb } from "@/lib/server/db";
import { HttpError } from "@/lib/server/stellar";
import type { SupportRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return handle(async () => {
    const me = await currentAccount();
    if (!me) throw new HttpError(401, "Sign in to contact support");
    rejectBanned(me);
    const body = await readJson(req);
    const payoutId = str(body.payoutId, "Transaction", 40, 4);
    const message = str(body.message, "Message", 500, 2);
    const created = await withDb((db) => {
      const payout = db.payouts.find((item) => item.id === payoutId && item.accountId === me.id);
      if (!payout) throw new HttpError(404, "That cash out was not found");
      const request: SupportRequest = {
        id: randomBytes(8).toString("hex"),
        accountId: me.id,
        payoutId,
        message,
        createdAt: new Date().toISOString(),
      };
      db.support.push(request);
      return request;
    });
    return ok(created, 201);
  });
}
