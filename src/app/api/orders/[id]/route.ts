import { randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { toStroops } from "@/lib/amount";
import { withDb, type DB } from "@/lib/server/db";
import { handle, ok, readJson, str } from "@/lib/server/api";
import { currentAccount, rejectBanned } from "@/lib/server/auth";
import { HttpError, readEscrow, verifyAuth, verifyDirectPayment, verifyRefundPayment } from "@/lib/server/stellar";
import { addUpdate, closeDelivery } from "@/lib/server/tracking";
import { TRACK_STAGES, type Order, type TrackStage } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function find(db: DB, id: string): Order {
  const order = db.orders.find((o) => o.id === id);
  if (!order) throw new HttpError(404, "Order not found");
  return order;
}

function touch(order: Order) {
  order.updatedAt = new Date().toISOString();
}

function optionalStr(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return trimmed;
}

/** The signed-in seller can update their own orders. A connected selling wallet can sign instead. */
async function assertSeller(order: Order, auth: unknown, action: string) {
  const me = await currentAccount();
  rejectBanned(me);
  if (me?.walletAddress && me.walletAddress === order.seller) return;
  verifyAuth({ xdr: auth, address: order.seller, action, subject: order.id });
}

const REFUND_REQUEST_STATUSES = ["paid", "shipped", "completed", "resolved"];

/** Records that the seller returned the money, and puts the stock back once. */
function settleRefund(db: DB, order: Order, detail: string) {
  if (order.status === "refunded" || order.status === "cancelled" || order.status === "rejected") return;
  const product = db.products.find((item) => item.id === order.productId);
  if (product) product.quantity += order.quantity;
  order.status = "refunded";
  if (!order.closedAt) order.closedAt = new Date().toISOString();
  addUpdate(order, { stage: "placed", location: "", message: detail, by: "seller" });
}

export function GET(_req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    return ok(await withDb((db) => find(db, id)));
  });
}

/** Reads the escrow on-chain and brings the order in line with it. */
async function syncEscrow(id: string, txHash?: string): Promise<Order> {
  const snapshot = await withDb((db) => ({ ...find(db, id) }));
  if (snapshot.mode !== "escrow") throw new HttpError(400, "This order does not use escrow");
  if (snapshot.status === "cancelled") throw new HttpError(409, "This order expired before it was paid");
  if (snapshot.status === "rejected") return snapshot;

  const chain = await readEscrow(id);
  if (!chain) {
    if (snapshot.status === "pending") throw new HttpError(409, "No escrow deposit found on-chain yet");
    return snapshot;
  }
  if (
    chain.buyer !== snapshot.buyer ||
    chain.seller !== snapshot.seller ||
    chain.amount !== toStroops(snapshot.total) ||
    (snapshot.releaseAfter !== null && chain.releaseAfter !== snapshot.releaseAfter)
  ) {
    throw new HttpError(400, "On-chain escrow does not match this order");
  }

  return withDb((db) => {
    const order = find(db, id);
    if (order.status === "rejected") return { ...order };
    if (order.status === "disputed" || order.status === "refund-approved") {
      if (chain.status === "Refunded") {
        settleRefund(db, order, "Seller returned the USDC from escrow.");
      }
      touch(order);
      return { ...order };
    }
    if (txHash && !order.txHash && /^[a-f0-9]{64}$/i.test(txHash)) order.txHash = txHash.toLowerCase();
    switch (chain.status) {
      case "Funded":
        if (order.status === "pending") {
          order.status = "paid";
          addUpdate(order, { stage: "paid", location: "", message: "Payment confirmed on Stellar.", by: "system" });
        }
        break;
      case "Released":
      case "Claimed":
        closeDelivery(order);
        break;
      case "Refunded":
        settleRefund(db, order, "Seller returned the USDC from escrow.");
        break;
      case "Disputed":
        order.status = "disputed";
        break;
      case "Resolved":
        order.status = "resolved";
        break;
    }
    touch(order);
    return { ...order };
  });
}

export function POST(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const body = await readJson(req);
    const action = body.action;

    switch (action) {
      case "confirm": {
        const snapshot = await withDb((db) => ({ ...find(db, id) }));
        if (snapshot.mode === "escrow") return ok(await syncEscrow(id, String(body.txHash ?? "")));

        if (snapshot.status !== "pending") return ok(snapshot);
        const txHash = str(body.txHash, "Transaction hash", 64, 64).toLowerCase();
        await verifyDirectPayment({
          txHash,
          orderId: snapshot.id,
          buyer: snapshot.buyer,
          seller: snapshot.seller,
          total: snapshot.total,
        });
        const updated = await withDb((db) => {
          if (db.orders.some((o) => o.txHash === txHash && o.id !== id)) {
            throw new HttpError(409, "That transaction was already used for another order");
          }
          const order = find(db, id);
          if (order.status === "cancelled") throw new HttpError(409, "This order expired before it was paid");
          if (order.status === "rejected") throw new HttpError(409, "An admin rejected this order");
          order.status = "paid";
          order.txHash = txHash;
          addUpdate(order, { stage: "paid", location: "", message: "Payment confirmed on Stellar.", by: "system" });
          touch(order);
          return { ...order };
        });
        return ok(updated);
      }

      case "sync":
        return ok(await syncEscrow(id));

      case "accept": {
        const snapshot = await withDb((db) => ({ ...find(db, id) }));
        await assertSeller(snapshot, body.auth, "accept");
        const updated = await withDb((db) => {
          const order = find(db, id);
          if (order.closedAt) throw new HttpError(409, "This delivery is closed");
          if (order.status !== "paid" && order.status !== "shipped") {
            throw new HttpError(409, "Only a paid order can be accepted");
          }
          if (!order.acceptedAt) {
            order.acceptedAt = new Date().toISOString();
            addUpdate(order, {
              stage: "paid",
              location: "",
              message: "Seller accepted the order.",
              by: "seller",
            });
            touch(order);
          }
          return { ...order };
        });
        return ok(updated);
      }

      case "ship": {
        const snapshot = await withDb((db) => ({ ...find(db, id) }));
        verifyAuth({ xdr: body.auth, address: snapshot.seller, action: "ship", subject: id });
        const location = str(body.location, "Location", 80, 2);
        const message = str(body.message, "Message", 300, 2);
        const updated = await withDb((db) => {
          const order = find(db, id);
          if (order.closedAt) throw new HttpError(409, "This delivery is closed");
          if (order.status !== "paid") throw new HttpError(409, "Only paid orders can be marked as shipped");
          order.status = "shipped";
          addUpdate(order, { stage: "picked-up", location, message, by: "seller" });
          touch(order);
          return { ...order };
        });
        return ok(updated);
      }

      case "details": {
        const snapshot = await withDb((db) => ({ ...find(db, id) }));
        await assertSeller(snapshot, body.auth, "details");
        const carrier = optionalStr(body.carrier, "Carrier", 40);
        const reference = optionalStr(body.reference, "Parcel reference", 40);
        const note = optionalStr(body.note, "Note", 300);
        const hasTrack = body.stage != null && body.stage !== "";
        if (hasTrack && body.stage !== "picked-up" && body.stage !== "in-transit" && body.stage !== "out-for-delivery") {
          throw new HttpError(400, "Choose how far the shipment has gone");
        }
        const location = hasTrack ? optionalStr(body.location, "Location", 80) : "";
        const message = hasTrack ? optionalStr(body.message, "Message", 300) : "";
        if (!carrier && !reference && !note && !hasTrack) {
          throw new HttpError(400, "Add a carrier, a parcel reference, a note, or a shipping update");
        }
        const stage = body.stage as TrackStage;
        const stageLabel = TRACK_STAGES.find((item) => item.id === stage)?.label ?? "Shipment update";
        const trackMessage = message || stageLabel;
        const updated = await withDb((db) => {
          const order = find(db, id);
          if (order.closedAt || (order.status !== "paid" && order.status !== "shipped")) {
            throw new HttpError(409, "Order details can be updated until delivery is closed");
          }
          const now = new Date().toISOString();
          if (!order.acceptedAt) {
            order.acceptedAt = now;
            addUpdate(order, { stage: "paid", location: "", message: "Seller accepted the order.", by: "seller" });
          }
          order.details = { carrier, reference, note, updatedAt: now };
          if (hasTrack) {
            const latest = [...order.updates].reverse().find((update) =>
              update.stage === "picked-up" || update.stage === "in-transit" || update.stage === "out-for-delivery",
            );
            const unchanged =
              latest?.stage === stage && latest.location === location && latest.message === trackMessage;
            if (!unchanged) {
              order.status = "shipped";
              addUpdate(order, { stage, location, message: trackMessage, by: "seller" });
            }
          }
          touch(order);
          return { ...order };
        });
        return ok(updated);
      }

      case "track": {
        const snapshot = await withDb((db) => ({ ...find(db, id) }));
        await assertSeller(snapshot, body.auth, "track");
        const stage = body.stage;
        if (stage !== "picked-up" && stage !== "in-transit" && stage !== "out-for-delivery") {
          throw new HttpError(400, "Choose how far the shipment has gone");
        }
        const location = str(body.location, "Location", 80, 2);
        const message = str(body.message, "Message", 300, 2);
        const updated = await withDb((db) => {
          const order = find(db, id);
          if (!order.acceptedAt) throw new HttpError(409, "Accept the order before updating it");
          if (order.closedAt || (order.status !== "paid" && order.status !== "shipped")) {
            throw new HttpError(409, "Tracking can be updated until delivery is closed");
          }
          order.status = "shipped";
          addUpdate(order, { stage: stage as TrackStage, location, message, by: "seller" });
          touch(order);
          return { ...order };
        });
        return ok(updated);
      }

      case "request-refund": {
        const me = await currentAccount();
        if (!me) throw new HttpError(401, "Sign in to request a refund");
        rejectBanned(me);
        const message = str(body.message, "Reason", 300, 2);
        const updated = await withDb((db) => {
          const order = find(db, id);
          const owns = order.accountId === me.id || (me.walletAddress !== null && order.buyer === me.walletAddress);
          if (!owns) throw new HttpError(403, "Only the buyer can request this refund");
          if (!REFUND_REQUEST_STATUSES.includes(order.status)) {
            throw new HttpError(409, "This order cannot be refunded right now");
          }
          order.status = "disputed";
          order.disputeMessage = message;
          addUpdate(order, {
            stage: "placed",
            location: "",
            message: `Buyer requested a refund. ${message}`,
            by: "buyer",
          });
          touch(order);
          return { ...order };
        });
        return ok(updated);
      }

      case "confirm-refund": {
        const snapshot = await withDb((db) => ({ ...find(db, id) }));
        if (snapshot.status !== "refund-approved") {
          throw new HttpError(409, "The marketplace has not approved this refund yet");
        }
        verifyAuth({ xdr: body.auth, address: snapshot.seller, action: "confirm-refund", subject: id });
        if (snapshot.mode === "escrow") {
          const chain = await readEscrow(id);
          if (!chain || chain.status !== "Refunded") {
            throw new HttpError(409, "Send the refund from your wallet before confirming it");
          }
        } else {
          const txHash = str(body.txHash, "Transaction hash", 64, 64).toLowerCase();
          await verifyRefundPayment({
            txHash,
            orderId: snapshot.id,
            buyer: snapshot.buyer,
            seller: snapshot.seller,
            total: snapshot.total,
          });
        }
        const updated = await withDb((db) => {
          const order = find(db, id);
          if (order.status !== "refund-approved") throw new HttpError(409, "This refund was already recorded");
          const detail =
            order.mode === "escrow"
              ? "Seller returned the USDC from escrow."
              : `Seller returned the USDC. Transaction ${String(body.txHash).toLowerCase()}.`;
          settleRefund(db, order, detail);
          touch(order);
          return { ...order };
        });
        return ok(updated);
      }

      case "seller-dispute": {
        const snapshot = await withDb((db) => ({ ...find(db, id) }));
        if (!snapshot.closedAt || snapshot.status !== "completed") {
          throw new HttpError(409, "A closed delivery can be disputed by the seller");
        }
        verifyAuth({ xdr: body.auth, address: snapshot.seller, action: "seller-dispute", subject: id });
        const message = str(body.message, "Message", 300, 2);
        const updated = await withDb((db) => {
          const order = find(db, id);
          if (!order.closedAt || order.status !== "completed") {
            throw new HttpError(409, "This delivery is not closed");
          }
          order.status = "disputed";
          order.disputeMessage = message;
          touch(order);
          return { ...order };
        });
        return ok(updated);
      }

      case "deliver": {
        // Escrow orders are completed by the buyer's on-chain `release` instead.
        const snapshot = await withDb((db) => ({ ...find(db, id) }));
        if (snapshot.mode !== "direct") throw new HttpError(400, "Release the escrow from your wallet instead");
        verifyAuth({ xdr: body.auth, address: snapshot.buyer, action: "deliver", subject: id });
        const updated = await withDb((db) => {
          const order = find(db, id);
          if (order.closedAt) return { ...order };
          if (order.status !== "paid" && order.status !== "shipped") {
            throw new HttpError(409, "This order cannot be confirmed right now");
          }
          closeDelivery(order);
          touch(order);
          return { ...order };
        });
        return ok(updated);
      }

      case "review": {
        const snapshot = await withDb((db) => ({ ...find(db, id) }));
        const me = await currentAccount();
        rejectBanned(me);
        const owns =
          me !== null &&
          (snapshot.accountId === me.id || (me.walletAddress !== null && snapshot.buyer === me.walletAddress));
        if (!owns) verifyAuth({ xdr: body.auth, address: snapshot.buyer, action: "review", subject: id });
        const rating = Number(body.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "Rating must be 1 to 5");
        const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 500) : "";
        const updated = await withDb((db) => {
          const order = find(db, id);
          if (order.status !== "completed" && order.status !== "resolved") {
            throw new HttpError(409, "You can review once the order is complete");
          }
          if (order.reviewed) throw new HttpError(409, "You already reviewed this order");
          order.reviewed = true;
          touch(order);
          db.reviews.push({
            id: randomBytes(8).toString("hex"),
            orderId: order.id,
            seller: order.seller,
            buyer: order.buyer,
            buyerName: me?.name || null,
            rating,
            comment,
            createdAt: new Date().toISOString(),
          });
          return { ...order };
        });
        return ok(updated);
      }

      default:
        throw new HttpError(400, "Unknown action");
    }
  });
}
