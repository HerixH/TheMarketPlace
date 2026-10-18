import { currentAccount } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/api";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ok({ account: await currentAccount() }));
}
