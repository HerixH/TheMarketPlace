import { randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { multiplyPrice } from "@/lib/amount";
import { ESCROW_ENABLED, ESCROW_RELEASE_SECONDS } from "@/lib/config";
import { DEMO_BUYER, isDemoShopper } from "@/lib/demo";
import { currentAccount, rejectBanned } from "@/lib/server/auth";
import { addUpdate, newTrackingNumber } from "@/lib/server/tracking";
import { withDb } from "@/lib/server/db";
import { handle, ok, readJson } from "@/lib/server/api";
import { HttpError, isValidAddress } from "@/lib/server/stellar";
import type { Order, Review } from "@/lib/types";

export const dynamic = "force-dynamic";

function presentOrder(order: Order, db: { reviews: Review[]; accounts: { id: string; walletAddress: string | null }[] }): Order {
  const review = db.reviews.find((item) => item.orderId === order.id);
  const sellerAccount = db.accounts.find((item) => item.walletAddress !== null && item.walletAddress === order.seller);
  const buyerAccount = order.accountId
    ? db.accounts.find((item) => item.id === order.accountId)
    : db.accounts.find((item) => item.walletAddress !== null && item.walletAddress === order.buyer);
  return {
    ...order,
    review: review ? { rating: review.rating, comment: review.comment, createdAt: review.createdAt } : null,
    sellerAccountId: sellerAccount?.id ?? null,
    buyerAccountId: buyerAccount?.id ?? null,
  };
}

export function GET(req: NextRequest) {
  return handle(async () => {
    if (req.nextUrl.searchParams.get("scope") === "me") {
      const me = await currentAccount();
      if (!me) throw new HttpError(401, "Sign in to see your orders");
      const orders = await withDb((db) => {
        const mine = db.orders.filter((o) => o.status !== "cancelled");
        const present = (order: Order) => presentOrder(order, db);
        return {
          buying: mine
            .filter((o) => o.accountId === me.id || (me.walletAddress !== null && o.buyer === me.walletAddress))
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
            .map(present),
          selling: mine
            .filter((o) => me.walletAddress !== null && o.seller === me.walletAddress)
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
            .map(present),
        };
      });
      return ok(orders);
    }

    const buyer = req.nextUrl.searchParams.get("buyer");
    const seller = req.nextUrl.searchParams.get("seller");
    if (!isValidAddress(buyer) && !isValidAddress(seller)) {
      throw new HttpError(400, "Provide a buyer or seller address");
    }
    const orders = await withDb((db) =>
      db.orders
        .filter((o) => (buyer ? o.buyer === buyer : true) && (seller ? o.seller === seller : true))
        .filter((o) => o.status !== "cancelled")
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((order) => presentOrder(order, db)),
    );
    return ok({ items: orders });
  });
}

/**
 * Creates a pending order and reserves stock. The buyer then pays with the
 * returned order id (as memo for direct payments / as escrow id), and calls
 * the `confirm` action so the server can verify the payment on-chain.
 */
export function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson(req);
    const me = await currentAccount();
    if (!me) throw new HttpError(401, "Sign in before you pay");
    rejectBanned(me);
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw new HttpError(400, "Invalid quantity");
    const requested = body.mode === "escrow" ? "escrow" : body.mode === "direct" ? "direct" : null;
    if (!requested) throw new HttpError(400, "Invalid payment mode");

    const order = await withDb((db): Order => {
      const product = db.products.find((p) => p.id === body.productId && p.active);
      if (!product) throw new HttpError(404, "Product not found");
      const sellerAccount = db.accounts.find((item) => item.walletAddress === product.sellerAddress);
      if (sellerAccount?.banned) throw new HttpError(403, "This seller is banned and cannot take orders");
      const demoPurchase = product.demo && isDemoShopper(me);
      if (product.demo && !demoPurchase) throw new HttpError(400, "This is a demo listing and cannot be purchased");
      const buyer = isValidAddress(body.buyer)
        ? body.buyer
        : isValidAddress(me.walletAddress)
          ? me.walletAddress
          : null;
      if (!demoPurchase && !buyer) throw new HttpError(400, "Connect a Stellar wallet first");
      if (!demoPurchase && requested === "escrow" && !ESCROW_ENABLED) {
        throw new HttpError(400, "Escrow is not available on this deployment");
      }
      const payer = buyer ?? DEMO_BUYER;
      if (!demoPurchase && product.sellerAddress === payer) throw new HttpError(400, "You cannot buy your own product");
      const mode = demoPurchase ? "direct" : requested;
      if (product.quantity < quantity) throw new HttpError(409, "Not enough stock available");

      product.quantity -= quantity;
      const now = new Date().toISOString();
      const created: Order = {
        // 24 hex chars: valid as a Soroban Symbol and as a text memo.
        id: randomBytes(12).toString("hex"),
        productId: product.id,
        productName: product.name,
        productImage: product.images[0] ?? null,
        buyer: payer,
        seller: product.sellerAddress,
        quantity,
        unitPrice: product.price,
        total: multiplyPrice(product.price, quantity),
        mode,
        status: demoPurchase ? "paid" : "pending",
        txHash: null,
        releaseAfter: mode === "escrow" ? Math.floor(Date.now() / 1000) + ESCROW_RELEASE_SECONDS : null,
        trackingNumber: newTrackingNumber(),
        updates: [],
        acceptedAt: null,
        closedAt: null,
        disputeMessage: null,
        resolutionNote: null,
        reviewed: false,
        accountId: me.id,
        createdAt: now,
        updatedAt: now,
      };
      addUpdate(created, {
        stage: "placed",
        location: "",
        message: demoPurchase ? "Demo order placed." : "Order placed. Waiting for payment.",
        by: "system",
      });
      if (demoPurchase) {
        addUpdate(created, {
          stage: "paid",
          location: "",
          message: "Demo purchase recorded. The USDC is held in Lenco until the seller cashes out.",
          by: "system",
        });
      }
      db.orders.push(created);
      return created;
    });
    return ok(order, 201);
  });
}
