import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { UPLOAD_DIR } from "@/lib/server/db";
import { handle, ok } from "@/lib/server/api";
import { HttpError } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024;

/** Detects the real image type from magic bytes instead of trusting the client. */
function sniff(buf: Buffer): "png" | "jpg" | "webp" | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

export function POST(req: NextRequest) {
  return handle(async () => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
    if (file.size > MAX_BYTES) throw new HttpError(413, "Images must be 3 MB or smaller");

    const buf = Buffer.from(await file.arrayBuffer());
    const ext = sniff(buf);
    if (!ext) throw new HttpError(415, "Only PNG, JPEG or WebP images are allowed");

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const name = `${randomBytes(12).toString("hex")}.${ext}`;
    await fs.writeFile(path.join(UPLOAD_DIR, name), buf);
    return ok({ url: `/api/uploads/${name}` }, 201);
  });
}
