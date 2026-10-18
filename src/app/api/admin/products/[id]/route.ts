import { NextRequest } from "next/server";
import { isValidPrice } from "@/lib/amount";
import { CATEGORIES } from "@/lib/constants";
import { handle, ok, readJson, str } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { withDb } from "@/lib/server/db";
import { HttpError } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function POST(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const body = await readJson(req);

    const product = await withDb((db) => {
      const found = db.products.find((item) => item.id === id);
      if (!found) throw new HttpError(404, "Listing not found");
      let changed = false;

      if ("active" in body) {
        if (typeof body.active !== "boolean") throw new HttpError(400, "Choose whether the listing stays visible");
        found.active = body.active;
        changed = true;
      }
      if ("name" in body) {
        found.name = str(body.name, "Product name", 100, 2);
        changed = true;
      }
      if ("description" in body) {
        found.description = str(body.description, "Description", 2000, 2);
        changed = true;
      }
      if ("sellerName" in body) {
        found.sellerName = str(body.sellerName, "Seller name", 40, 2);
        changed = true;
      }
      if ("price" in body) {
        const price = str(body.price, "Price", 20);
        if (!isValidPrice(price)) throw new HttpError(400, "Price must be a positive USDC amount");
        found.price = price.replace(/^0+(?=\d)/, "");
        changed = true;
      }
      if ("quantity" in body) {
        const quantity = Number(body.quantity);
        if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100_000) {
          throw new HttpError(400, "Quantity must be a whole number from 0 to 100000");
        }
        found.quantity = quantity;
        changed = true;
      }
      if ("category" in body) {
        const category = str(body.category, "Category", 40);
        if (!(CATEGORIES as readonly string[]).includes(category)) throw new HttpError(400, "Unknown category");
        found.category = category;
        changed = true;
      }
      if (!changed) throw new HttpError(400, "Nothing to update");
      return { ...found };
    });
    return ok(product);
  });
}
