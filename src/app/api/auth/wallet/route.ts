import { currentAccount, linkWallet } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/api";
import { HttpError, isValidAddress, verifyAuth } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";

/** Links a Stellar wallet to the signed-in account. The wallet must sign to prove ownership. */
export function POST(req: Request) {
  return handle(async () => {
    const account = await currentAccount();
    if (!account) throw new HttpError(401, "Sign in first");
    const body = await readJson(req);
    if (!isValidAddress(body.address)) throw new HttpError(400, "A valid Stellar wallet address is required");
    verifyAuth({ xdr: body.auth, address: body.address, action: "link-wallet" });
    return ok(await linkWallet(account.id, body.address));
  });
}
