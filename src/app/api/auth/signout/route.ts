import { clearSessionCookie, signOut } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/api";

export const dynamic = "force-dynamic";

export function POST() {
  return handle(async () => {
    await signOut();
    const res = ok({ ok: true });
    clearSessionCookie(res);
    return res;
  });
}
