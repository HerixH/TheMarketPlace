import { NextRequest } from "next/server";
import { handle, ok } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { withDb } from "@/lib/server/db";
import { HttpError } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function DELETE(_req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    await withDb((db) => {
      const review = db.reviews.find((item) => item.id === id);
      if (!review) throw new HttpError(404, "Review not found");
      db.reviews = db.reviews.filter((item) => item.id !== id);
      const order = db.orders.find((item) => item.id === review.orderId);
      if (order) order.reviewed = false;
    });
    return ok({ ok: true });
  });
}
