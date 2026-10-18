import { NextRequest } from "next/server";
import { handle, ok, readJson, str } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { withDb } from "@/lib/server/db";
import { HttpError } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Admin reply on a support note. This does not change the cash out or any dispute. */
export function POST(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const body = await readJson(req);
    const updated = await withDb((db) => {
      const request = db.support.find((item) => item.id === id);
      if (!request) throw new HttpError(404, "That support message was not found");
      if (body.action === "close") {
        request.status = "closed";
        request.closedAt = new Date().toISOString();
        return { ...request };
      }
      const reply = str(body.reply, "Reply", 500, 2);
      request.reply = reply;
      request.repliedAt = new Date().toISOString();
      if (request.status !== "closed") request.status = "open";
      return { ...request };
    });
    return ok(updated);
  });
}
