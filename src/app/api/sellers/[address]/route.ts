import { NextRequest } from "next/server";
import { handle, ok } from "@/lib/server/api";
import { getSellerProfile } from "@/lib/server/sellers";
import { HttpError, isValidAddress } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";

export function GET(_req: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  return handle(async () => {
    const { address } = await params;
    if (!isValidAddress(address)) throw new HttpError(400, "Invalid address");
    return ok(await getSellerProfile(address));
  });
}
