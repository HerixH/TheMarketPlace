import { createSession, setSessionCookie, signUp } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/api";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const account = await signUp({
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      name: String(body.name ?? ""),
    });
    const token = await createSession(account.id);
    const res = ok(account, 201);
    setSessionCookie(req, res, token);
    return res;
  });
}
