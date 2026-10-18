import { NextRequest } from "next/server";
import { isValidPrice } from "@/lib/amount";
import { CATEGORIES } from "@/lib/constants";
import { handle, ok, readJson, str } from "@/lib/server/api";
import { currentAccount, rejectBanned } from "@/lib/server/auth";
import { withDb } from "@/lib/server/db";
import { HttpError, verifyAuth } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const product = await withDb((db) => db.products.find((p) => p.id === id));
    if (!product) throw new HttpError(404, "Product not found");
    return ok(product);
  });
}

/** Seller updates the listing. Existing orders keep the price and quantity they were placed with. */
export function POST(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const body = await readJson(req);
    const me = await currentAccount();
    if (!me) throw new HttpError(401, "Sign in to update this listing");
    rejectBanned(me);

    const product = await withDb((db) => {
      const found = db.products.find((item) => item.id === id);
      if (!found) throw new HttpError(404, "Listing not found");
      if (me.walletAddress !== found.sellerAddress) {
        verifyAuth({ xdr: body.auth, address: found.sellerAddress, action: "update-listing", subject: id });
      }
      if ("name" in body) found.name = str(body.name, "Product name", 100, 2);
      if ("description" in body) found.description = str(body.description, "Description", 2000, 2);
      if ("sellerName" in body) found.sellerName = str(body.sellerName, "Seller name", 40, 2);
      if ("price" in body) {
        const price = str(body.price, "Price", 20);
        if (!isValidPrice(price)) throw new HttpError(400, "Price must be a positive USDC amount");
        found.price = price.replace(/^0+(?=\d)/, "");
      }
      if ("quantity" in body) {
        const quantity = Number(body.quantity);
        if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100_000) {
          throw new HttpError(400, "Quantity must be a whole number from 0 to 100000");
        }
        found.quantity = quantity;
      }
      if ("category" in body) {
        const category = str(body.category, "Category", 40);
        if (!(CATEGORIES as readonly string[]).includes(category)) throw new HttpError(400, "Unknown category");
        found.category = category;
      }
      if ("active" in body) {
        if (typeof body.active !== "boolean") throw new HttpError(400, "Choose whether this listing is for sale");
        if (body.active && found.pulledForBan) {
          throw new HttpError(403, "This listing was removed because the seller account is banned");
        }
        found.active = body.active;
      }
      return { ...found };
    });
    return ok(product);
  });
}

/** Seller delists their product. */
export function DELETE(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const body = await readJson(req);
    const me = await currentAccount();
    rejectBanned(me);

    await withDb((db) => {
      const product = db.products.find((p) => p.id === id && p.active);
      if (!product) throw new HttpError(404, "Product not found");
      if (me?.walletAddress !== product.sellerAddress) {
        const address = String(body.address ?? "");
        verifyAuth({ xdr: body.auth, address, action: "delist", subject: id });
        if (product.sellerAddress !== address) throw new HttpError(403, "Only the seller can delist this product");
      }
      product.active = false;
    });
    return ok({ ok: true });
  });
}
