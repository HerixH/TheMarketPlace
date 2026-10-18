import { NextRequest } from "next/server";
import { handle, ok, readJson, str } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { withDb } from "@/lib/server/db";
import { HttpError } from "@/lib/server/stellar";
import { addUpdate, closeDelivery } from "@/lib/server/tracking";
import { TRACK_STAGES, type TrackStage } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Owner actions on any order: resolve a dispute, reject a non-genuine order, update tracking, cancel, or close delivery. */
export function POST(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const body = await readJson(req);
    const action = typeof body.action === "string" ? body.action : "resolve";

    const order = await withDb((db) => {
      const found = db.orders.find((o) => o.id === id);
      if (!found) throw new HttpError(404, "Order not found");

      if (action === "resolve") {
        const outcome = body.outcome;
        if (outcome !== "refund" && outcome !== "release") {
          throw new HttpError(400, "Choose a refund or a release");
        }
        if (found.status !== "disputed") throw new HttpError(409, "Only a refund request can be reviewed");
        const message = str(body.message, "Decision", 300, 2);
        if (outcome === "refund") {
          found.status = "refund-approved";
          found.resolutionNote = `Refund approved. The seller must return the USDC to the buyer. ${message}`;
          addUpdate(found, {
            stage: "placed",
            location: "",
            message: "Marketplace approved the refund. The seller still has to send the USDC back.",
            by: "admin",
          });
        } else {
          found.status = "resolved";
          found.resolutionNote = `Refund denied. The payment stays with the seller. ${message}`;
          addUpdate(found, {
            stage: "placed",
            location: "",
            message: `Marketplace denied the refund. ${message}`,
            by: "admin",
          });
        }
      } else if (action === "track") {
        if (found.closedAt) throw new HttpError(409, "Delivery is closed");
        if (
          found.status === "cancelled" ||
          found.status === "refunded" ||
          found.status === "resolved" ||
          found.status === "rejected" ||
          found.status === "refund-approved"
        ) {
          throw new HttpError(409, "This order is already finished");
        }
        const stage = body.stage;
        if (typeof stage !== "string" || !TRACK_STAGES.some((item) => item.id === stage)) {
          throw new HttpError(400, "Choose a tracking stage");
        }
        const location = str(body.location, "Location", 80, 2);
        const message = str(body.message, "Message", 300, 2);
        addUpdate(found, { stage: stage as TrackStage, location, message, by: "admin" });
        if (found.status === "paid") found.status = "shipped";
      } else if (action === "cancel") {
        if (found.status !== "pending") throw new HttpError(409, "Only an unpaid order can be cancelled");
        found.status = "cancelled";
        const product = db.products.find((item) => item.id === found.productId);
        if (product) product.quantity += found.quantity;
        addUpdate(found, {
          stage: "placed",
          location: "",
          message: "The owner cancelled this order and returned the stock.",
          by: "admin",
        });
      } else if (action === "reject") {
        if (!["pending", "paid", "shipped", "disputed", "completed", "resolved"].includes(found.status)) {
          throw new HttpError(409, "This order can no longer be rejected");
        }
        const reason = str(body.message, "Reason", 300, 2);
        const paid = found.status !== "pending";
        found.status = "rejected";
        if (!found.closedAt) found.closedAt = new Date().toISOString();
        found.resolutionNote = paid
          ? `Rejected. This order does not look genuine. ${reason} Stock is back on the listing. On-chain funds are not moved by this decision.`
          : `Rejected before payment. This order does not look genuine. ${reason}`;
        const product = db.products.find((item) => item.id === found.productId);
        if (product) product.quantity += found.quantity;
        addUpdate(found, {
          stage: "placed",
          location: "",
          message: `Rejected by admin. ${reason}`,
          by: "admin",
        });
      } else if (action === "close") {
        if (found.closedAt) return { ...found };
        if (found.status !== "paid" && found.status !== "shipped") {
          throw new HttpError(409, "This order cannot be closed right now");
        }
        closeDelivery(found);
      } else {
        throw new HttpError(400, "Unknown action");
      }

      found.updatedAt = new Date().toISOString();
      return { ...found };
    });
    return ok(order);
  });
}
