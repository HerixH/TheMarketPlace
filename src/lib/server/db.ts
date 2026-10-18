import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Order, Payout, Product, Report, Review, SupportRequest, TrackingUpdate } from "../types";

export interface AccountRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  walletAddress: string | null;
  admin?: boolean;
  banned?: boolean;
  banReason?: string | null;
  bannedAt?: string | null;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  accountId: string;
  expiresAt: string;
}

export interface DB {
  products: Product[];
  orders: Order[];
  reviews: Review[];
  accounts: AccountRecord[];
  sessions: SessionRecord[];
  reports: Report[];
  payouts: Payout[];
  support: SupportRequest[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

/** Unpaid orders release their reserved stock after this long. */
const PENDING_TTL_MS = 20 * 60 * 1000;

let queue: Promise<unknown> = Promise.resolve();

async function read(): Promise<DB> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<DB>;
    return {
      products: parsed.products ?? [],
      orders: (parsed.orders ?? []).map(normalizeOrder),
      reviews: parsed.reviews ?? [],
      accounts: parsed.accounts ?? [],
      sessions: parsed.sessions ?? [],
      reports: parsed.reports ?? [],
      payouts: parsed.payouts ?? [],
      support: parsed.support ?? [],
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { products: [], orders: [], reviews: [], accounts: [], sessions: [], reports: [], payouts: [], support: [] };
    }
    throw err;
  }
}

async function write(db: DB): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  let last: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await fs.rename(tmp, DB_PATH);
      return;
    } catch (err) {
      last = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw err;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  await fs.copyFile(tmp, DB_PATH);
  await fs.unlink(tmp).catch(() => undefined);
  void last;
}

function normalizeOrder(order: Order): Order {
  const updates = Array.isArray(order.updates) ? order.updates : [];
  return {
    ...order,
    trackingNumber: order.trackingNumber || `MP-${order.id.slice(0, 4).toUpperCase()}-${order.id.slice(4, 8).toUpperCase()}`,
    updates: updates as TrackingUpdate[],
    acceptedAt: order.acceptedAt ?? null,
    closedAt: order.closedAt ?? (order.status === "completed" ? order.updatedAt : null),
    disputeMessage: order.disputeMessage ?? null,
    resolutionNote: order.resolutionNote ?? null,
  };
}

function expireStalePending(db: DB): boolean {
  const now = Date.now();
  let changed = false;
  for (const order of db.orders) {
    if (order.status === "pending" && now - Date.parse(order.createdAt) > PENDING_TTL_MS) {
      order.status = "cancelled";
      order.updatedAt = new Date().toISOString();
      const product = db.products.find((p) => p.id === order.productId);
      if (product) product.quantity += order.quantity;
      changed = true;
    }
  }
  return changed;
}

/**
 * Runs `fn` with exclusive access to the database. Changes made to the
 * object passed to `fn` are persisted when it returns.
 */
export function withDb<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await read();
    db.accounts ??= [];
    db.sessions ??= [];
    db.reports ??= [];
    db.payouts ??= [];
    db.support ??= [];
    const expired = expireStalePending(db);
    const before = expired ? "" : JSON.stringify(db);
    const result = await fn(db);
    if (expired || JSON.stringify(db) !== before) await write(db);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}
