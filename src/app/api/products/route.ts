import { randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { isValidPrice } from "@/lib/amount";
import { CATEGORIES, PAGE_SIZE } from "@/lib/constants";
import { currentAccount, linkWallet, rejectBanned } from "@/lib/server/auth";
import { withDb } from "@/lib/server/db";
import { listProducts } from "@/lib/server/products";
import { handle, ok, readJson, str } from "@/lib/server/api";
import { assertCanReceiveUsdc, HttpError, isValidAddress, verifyAuth } from "@/lib/server/stellar";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return handle(async () => {
    const sp = req.nextUrl.searchParams;
    return ok(
      await listProducts({
        q: sp.get("q") ?? undefined,
        category: sp.get("category") ?? undefined,
        seller: sp.get("seller") ?? undefined,
        sort: sp.get("sort") ?? undefined,
        page: Number(sp.get("page")) || 1,
        limit: Number(sp.get("limit")) || PAGE_SIZE,
        includeSoldOut: sp.get("soldOut") === "1",
      }),
    );
  });
}

export function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson(req);
    const me = await currentAccount();
    if (!me) throw new HttpError(401, "Sign in before you list a product");
    rejectBanned(me);
    const sellerAddress = body.sellerAddress;
    if (!isValidAddress(sellerAddress)) throw new HttpError(400, "A valid Stellar wallet address is required");
    verifyAuth({ xdr: body.auth, address: sellerAddress, action: "list" });
    if (!me.walletAddress) await linkWallet(me.id, sellerAddress);

    const name = str(body.name, "Product name", 100, 2);
    const description = str(body.description, "Description", 2000, 10);
    const sellerName = typeof body.sellerName === "string" ? body.sellerName.trim().slice(0, 40) : "";
    const price = str(body.price, "Price", 20);
    if (!isValidPrice(price)) throw new HttpError(400, "Price must be a positive USDC amount (max 7 decimals)");
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100_000) {
      throw new HttpError(400, "Quantity must be a whole number between 1 and 100000");
    }
    const category = str(body.category, "Category", 40);
    if (!(CATEGORIES as readonly string[]).includes(category)) throw new HttpError(400, "Unknown category");

    const images = Array.isArray(body.images) ? body.images : [];
    if (
      images.length < 3 ||
      images.length > 6 ||
      images.some((i) => typeof i !== "string" || !/^\/api\/uploads\/[\w.-]+$/.test(i))
    ) {
      throw new HttpError(400, "Add at least 3 photos");
    }

    await assertCanReceiveUsdc(sellerAddress);

    const product: Product = {
      id: randomBytes(8).toString("hex"),
      name,
      description,
      price: price.replace(/^0+(?=\d)/, ""),
      quantity,
      category,
      images: images as string[],
      sellerAddress,
      sellerName: sellerName || `Seller ${sellerAddress.slice(0, 4)}…${sellerAddress.slice(-4)}`,
      active: true,
      createdAt: new Date().toISOString(),
    };
    await withDb((db) => {
      db.products.push(product);
    });
    return ok(product, 201);
  });
}
