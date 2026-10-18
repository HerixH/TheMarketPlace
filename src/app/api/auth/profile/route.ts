import { currentAccount, updateProfile } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/api";
import { HttpError } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handle(async () => {
    const account = await currentAccount();
    if (!account) throw new HttpError(401, "Sign in");
    const body = await readJson(req);
    return ok(await updateProfile(account.id, body));
  });
}
