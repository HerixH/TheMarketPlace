import "server-only";
import { NextResponse } from "next/server";
import { HttpError } from "./stellar";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, "Invalid JSON body");
}

export function str(value: unknown, field: string, max: number, min = 1): string {
  if (typeof value !== "string") throw new HttpError(400, `${field} is required`);
  const v = value.trim();
  if (v.length < min) throw new HttpError(400, `${field} is required`);
  if (v.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return v;
}
