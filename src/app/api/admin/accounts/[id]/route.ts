import { NextRequest } from "next/server";
import { publicAccount, requireAdmin } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/api";
import { withDb } from "@/lib/server/db";
import { banAccount, unbanAccount } from "@/lib/server/moderation";
import { HttpError } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function POST(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const me = await requireAdmin();
    const { id } = await params;
    const body = await readJson(req);
    if (body.action === "unban") {
      await unbanAccount(id);
      const account = await withDb((db) => {
        const found = db.accounts.find((item) => item.id === id);
        if (!found) throw new HttpError(404, "Account not found");
        return publicAccount(found);
      });
      return ok(account);
    }
    if (body.action === "ban") {
      if (id === me.id) throw new HttpError(409, "You cannot ban your own account");
      const account = await withDb((db) => {
        const found = db.accounts.find((item) => item.id === id);
        if (!found) throw new HttpError(404, "Account not found");
        const open = db.reports
          .filter((report) => report.accountId === id && report.status === "open")
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
        if (!open) throw new HttpError(409, "Ban an account only after it has been reported");
        banAccount(db, found, open.reason);
        open.status = "banned";
        open.resolvedAt = new Date().toISOString();
        for (const report of db.reports) {
          if (report.accountId === id && report.status === "open") {
            report.status = "banned";
            report.resolvedAt = open.resolvedAt;
          }
        }
        return publicAccount(found);
      });
      return ok(account);
    }
    const admin = body.admin;
    if (typeof admin !== "boolean") throw new HttpError(400, "Choose whether this account is an admin");
    if (id === me.id && !admin) {
      throw new HttpError(409, "You cannot remove your own admin access");
    }

    const account = await withDb((db) => {
      const found = db.accounts.find((item) => item.id === id);
      if (!found) throw new HttpError(404, "Account not found");
      found.admin = admin;
      return publicAccount(found);
    });
    return ok(account);
  });
}
