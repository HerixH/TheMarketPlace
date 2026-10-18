import { NextRequest } from "next/server";
import { currentAccount, rejectBanned } from "@/lib/server/auth";
import { handle, ok, readJson, str } from "@/lib/server/api";
import { fileReport } from "@/lib/server/moderation";
import { HttpError } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return handle(async () => {
    const me = await currentAccount();
    if (!me) throw new HttpError(401, "Sign in to report an account");
    rejectBanned(me);
    const body = await readJson(req);
    const reason = str(body.reason, "Reason", 300, 10);
    const report = await fileReport({
      reporterId: me.id,
      accountId: typeof body.accountId === "string" ? body.accountId : null,
      address: typeof body.address === "string" ? body.address : null,
      reason,
    });
    return ok(report, 201);
  });
}
