import { NextRequest } from "next/server";
import { handle, ok } from "@/lib/server/api";
import { currentAccount, rejectBanned } from "@/lib/server/auth";
import { resolveMobileMoney } from "@/lib/server/lenco";
import { HttpError } from "@/lib/server/stellar";
import { detectZmOperator, zambiaLocalNumber } from "@/lib/zm-mobile";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return handle(async () => {
    const me = await currentAccount();
    if (!me) throw new HttpError(401, "Sign in to cash out");
    rejectBanned(me);
    if (me.admin) throw new HttpError(403, "Admin accounts do not cash out");
    const phone = req.nextUrl.searchParams.get("phone") ?? "";
    const local = zambiaLocalNumber(phone);
    const operator = local ? detectZmOperator(local) : null;
    if (!local || !operator) throw new HttpError(400, "Enter a 10-digit Airtel, MTN, or Zamtel number");
    return ok(await resolveMobileMoney({ phone: local, operator, profileName: me.name }));
  });
}
