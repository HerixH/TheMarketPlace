import { NextRequest } from "next/server";
import { handle, ok, readJson, str } from "@/lib/server/api";
import { currentAccount, rejectBanned } from "@/lib/server/auth";
import { resolveMobileMoney } from "@/lib/server/lenco";
import { cashOut, readLencoBalance } from "@/lib/server/payouts";
import { HttpError } from "@/lib/server/stellar";
import { detectZmOperator, zambiaLocalNumber } from "@/lib/zm-mobile";

export const dynamic = "force-dynamic";

async function seller() {
  const me = await currentAccount();
  if (!me) throw new HttpError(401, "Sign in to see your Lenco balance");
  rejectBanned(me);
  if (me.admin) throw new HttpError(403, "Admin accounts do not hold a Lenco balance");
  if (!me.walletAddress) throw new HttpError(400, "Link the selling wallet before cashing out");
  return me;
}

export function GET() {
  return handle(async () => {
    const me = await seller();
    return ok(await readLencoBalance(me.walletAddress!));
  });
}

export function POST(req: NextRequest) {
  return handle(async () => {
    const me = await seller();
    const body = await readJson(req);
    const accountNumber = str(body.accountNumber, "Phone number", 30, 5);
    const local = zambiaLocalNumber(accountNumber);
    const operator = local ? detectZmOperator(local) : null;
    if (!local || !operator) throw new HttpError(400, "Enter a 10-digit Airtel, MTN, or Zamtel number");
    const resolved = await resolveMobileMoney({ phone: local, operator, profileName: me.name });
    const balance = await cashOut({
      accountId: me.id,
      seller: me.walletAddress!,
      amount: str(body.amount, "Amount", 20),
      method: "mobile-money",
      accountName: resolved.accountName,
      accountNumber: local,
      bankName: operator,
    });
    return ok(balance, 201);
  });
}
