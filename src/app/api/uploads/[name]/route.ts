import { NextRequest, NextResponse } from "next/server";
import { readUpload } from "@/lib/server/db";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const match = /^([a-f0-9]{24})\.(png|jpg|webp)$/.exec(name);
  if (!match) return new NextResponse("Not found", { status: 404 });
  const data = await readUpload(name).catch(() => null);
  if (!data) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": TYPES[match[2]],
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
