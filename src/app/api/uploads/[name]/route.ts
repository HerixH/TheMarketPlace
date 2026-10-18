import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { UPLOAD_DIR } from "@/lib/server/db";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const match = /^([a-f0-9]{24})\.(png|jpg|webp)$/.exec(name);
  if (!match) return new NextResponse("Not found", { status: 404 });
  try {
    const data = await fs.readFile(path.join(UPLOAD_DIR, name));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPES[match[2]],
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
