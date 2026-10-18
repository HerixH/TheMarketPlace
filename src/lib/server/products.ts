import "server-only";
import { toStroops } from "../amount";
import { PAGE_SIZE } from "../constants";
import type { Product } from "../types";
import { withDb, type DB } from "./db";

function attachRatings(db: DB, products: Product[]): Product[] {
  const scores = new Map<string, number[]>();
  for (const review of db.reviews) {
    const order = db.orders.find((item) => item.id === review.orderId);
    if (!order) continue;
    const list = scores.get(order.productId) ?? [];
    list.push(review.rating);
    scores.set(order.productId, list);
  }
  return products.map((product) => {
    const ratings = scores.get(product.id) ?? [];
    return {
      ...product,
      reviewCount: ratings.length,
      rating: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null,
    };
  });
}

export interface ProductQuery {
  q?: string;
  category?: string;
  seller?: string;
  sort?: string;
  page?: number;
  limit?: number;
  includeSoldOut?: boolean;
  /** Shop and seller pages keep withdrawn listings visible until they are relisted. */
  includeInactive?: boolean;
}

export interface ProductPage {
  items: Product[];
  total: number;
  page: number;
  limit: number;
}

export async function listProducts(query: ProductQuery = {}): Promise<ProductPage> {
  const q = (query.q ?? "").trim().toLowerCase();
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(48, Math.max(1, query.limit ?? PAGE_SIZE));

  const all = await withDb((db) =>
    attachRatings(db, db.products.filter((p) => query.includeInactive || p.active)),
  );

  const items = all
    .filter((p) => {
      if (!query.includeSoldOut && p.quantity <= 0) return false;
      if (query.category && p.category !== query.category) return false;
      if (query.seller && p.sellerAddress !== query.seller) return false;
      if (q) {
        const hay = `${p.name} ${p.description} ${p.sellerName} ${p.category}`.toLowerCase();
        return q.split(/\s+/).every((word) => hay.includes(word));
      }
      return true;
    })
    .sort((a, b) => {
      switch (query.sort) {
        case "price-asc":
          return Number(toStroops(a.price) - toStroops(b.price));
        case "price-desc":
          return Number(toStroops(b.price) - toStroops(a.price));
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      }
    });

  return { items: items.slice((page - 1) * limit, page * limit), total: items.length, page, limit };
}

export async function getProduct(id: string): Promise<Product | null> {
  return withDb((db) => {
    const product = db.products.find((p) => p.id === id);
    return product ? attachRatings(db, [product])[0] : null;
  });
}
