import "server-only";
import { shortAddress } from "../amount";
import { salesCount, salesVolume } from "../sales";
import type { Review, SellerProfile } from "../types";
import { withDb, type DB } from "./db";

export function withReviewer(db: DB, review: Review): Review {
  const order = db.orders.find((item) => item.id === review.orderId);
  const account =
    db.accounts.find((item) => order?.accountId && item.id === order.accountId) ??
    db.accounts.find((item) => item.walletAddress !== null && item.walletAddress === review.buyer);
  return {
    ...review,
    productId: order?.productId ?? review.productId ?? null,
    productName: order?.productName ?? review.productName ?? null,
    buyerName: review.buyerName || account?.name || shortAddress(review.buyer),
  };
}

export function getSellerProfile(address: string): Promise<SellerProfile> {
  return withDb((db) => {
    const products = db.products.filter((p) => p.sellerAddress === address);
    const reviews = db.reviews
      .filter((r) => r.seller === address)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((review) => withReviewer(db, review));
    const sellerOrders = db.orders.filter((o) => o.seller === address);
    const completedOrders = sellerOrders.filter((o) => o.status === "completed").length;
    const dates = [...products.map((p) => p.createdAt), ...sellerOrders.map((o) => o.createdAt)];
    const newest = products.find((p) => p.sellerName)?.sellerName;
    const account = db.accounts.find((item) => item.walletAddress === address);
    return {
      address,
      name: account?.name || newest || `Seller ${address.slice(0, 4)}…${address.slice(-4)}`,
      accountId: account?.id ?? null,
      banned: account?.banned === true,
      completedOrders,
      salesVolume: salesVolume(sellerOrders),
      salesCount: salesCount(sellerOrders),
      reviewCount: reviews.length,
      averageRating: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null,
      memberSince: dates.length ? dates.sort()[0] : null,
      reviews,
    };
  });
}
