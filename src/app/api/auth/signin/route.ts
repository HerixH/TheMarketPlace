import { createSession, setSessionCookie, signIn } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/api";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const account = await signIn({ email: String(body.email ?? ""), password: String(body.password ?? "") });
    const token = await createSession(account.id);
    const res = ok(account);
    setSessionCookie(req, res, token);
    return res;
  });
}
