import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/api";
import { resolveReport } from "@/lib/server/moderation";
import { HttpError } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function POST(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const me = await requireAdmin();
    const { id } = await params;
    const body = await readJson(req);
    const action = body.action === "ban" ? "ban" : body.action === "dismiss" ? "dismiss" : null;
    if (!action) throw new HttpError(400, "Choose ban or dismiss");
    return ok(await resolveReport(id, action, me.id));
  });
}
