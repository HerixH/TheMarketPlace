import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COUNTRIES } from "../countries";
import type { Account } from "../types";
import { withDb, type AccountRecord } from "./db";
import { HttpError } from "./stellar";

const COOKIE = "marketplace_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export function publicAccount(account: AccountRecord): Account {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    walletAddress: account.walletAddress,
    admin: account.admin === true,
    banned: account.banned === true,
    banReason: account.banReason ?? null,
    address: account.address ?? null,
    city: account.city ?? null,
    country: account.country ?? null,
    createdAt: account.createdAt,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function checkPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Email is required");
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    throw new HttpError(400, "Enter a valid email address");
  }
  return email;
}

export function banMessage(reason: string | null | undefined): string {
  const detail = reason?.trim();
  return detail
    ? `This account is banned for a marketplace violation. ${detail}`
    : "This account is banned for a marketplace violation.";
}

export function rejectBanned(account: { banned?: boolean; banReason?: string | null } | null | undefined): void {
  if (account?.banned) throw new HttpError(403, banMessage(account.banReason));
}

export function checkPasswordPolicy(value: unknown): string {
  if (typeof value !== "string" || value.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
  }
  if (value.length > 72) throw new HttpError(400, "Password must be at most 72 characters");
  return value;
}

export async function createSession(accountId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
  await withDb((db) => {
    db.sessions = db.sessions.filter((s) => s.accountId !== accountId && Date.parse(s.expiresAt) > Date.now());
    db.sessions.push({ id, accountId, expiresAt });
  });
  return token;
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function currentAccount(): Promise<Account | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const id = hashToken(token);
  return withDb((db) => {
    const session = db.sessions.find((s) => s.id === id && Date.parse(s.expiresAt) > Date.now());
    const account = session ? db.accounts.find((a) => a.id === session.accountId) : undefined;
    if (account?.banned) {
      db.sessions = db.sessions.filter((item) => item.accountId !== account.id);
      return null;
    }
    return account ? publicAccount(account) : null;
  });
}

export async function signUp(input: { email: string; password: string; name: string }): Promise<Account> {
  const email = normalizeEmail(input.email);
  const password = checkPasswordPolicy(input.password);
  const name = input.name.trim();
  if (name.length < 2 || name.length > 40) throw new HttpError(400, "Name must be 2 to 40 characters");

  const account = await withDb((db) => {
    if (db.accounts.some((a) => a.email === email)) throw new HttpError(409, "An account with that email already exists");
    const created: AccountRecord = {
      id: randomBytes(8).toString("hex"),
      email,
      name,
      passwordHash: hashPassword(password),
      walletAddress: null,
      admin: false,
      banned: false,
      banReason: null,
      bannedAt: null,
      createdAt: new Date().toISOString(),
    };
    db.accounts.push(created);
    return created;
  });
  return publicAccount(account);
}

export async function signIn(input: { email: string; password: string }): Promise<Account> {
  const email = normalizeEmail(input.email);
  const password = typeof input.password === "string" ? input.password : "";
  const account = await withDb((db) => db.accounts.find((a) => a.email === email) ?? null);
  if (!account || !checkPassword(password, account.passwordHash)) {
    throw new HttpError(401, "Email or password is incorrect");
  }
  rejectBanned(account);
  return publicAccount(account);
}

export async function requireAdmin(): Promise<Account> {
  const account = await currentAccount();
  if (!account) throw new HttpError(401, "Sign in");
  if (!account.admin) throw new HttpError(403, "Only an admin can do that");
  return account;
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return;
  const id = hashToken(token);
  await withDb((db) => {
    db.sessions = db.sessions.filter((s) => s.id !== id);
  });
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new HttpError(400, `${label} must be text`);
  const text = value.trim();
  if (text.length > max) throw new HttpError(400, `${label} must be at most ${max} characters`);
  return text || null;
}

export async function updateProfile(
  accountId: string,
  input: { name?: unknown; address?: unknown; city?: unknown; country?: unknown },
): Promise<Account> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2 || name.length > 40) throw new HttpError(400, "Name must be 2 to 40 characters");
  const address = optionalText(input.address, "Address", 200);
  const city = optionalText(input.city, "City", 60);
  const country = optionalText(input.country, "Country", 60);
  if (country && !(COUNTRIES as readonly string[]).includes(country)) throw new HttpError(400, "Choose a country from the list");

  const account = await withDb((db) => {
    const mine = db.accounts.find((a) => a.id === accountId);
    if (!mine) throw new HttpError(401, "Sign in again");
    mine.name = name;
    mine.address = address;
    mine.city = city;
    mine.country = country;
    return mine;
  });
  return publicAccount(account);
}

/** Changes the password and signs out every other session on the account. */
export async function changePassword(accountId: string, current: unknown, next: unknown): Promise<void> {
  const password = checkPasswordPolicy(next);
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const keep = token ? hashToken(token) : null;
  await withDb((db) => {
    const mine = db.accounts.find((a) => a.id === accountId);
    if (!mine) throw new HttpError(401, "Sign in again");
    if (typeof current !== "string" || !checkPassword(current, mine.passwordHash)) {
      throw new HttpError(400, "Current password is incorrect");
    }
    if (checkPassword(password, mine.passwordHash)) throw new HttpError(400, "Choose a password you have not used here");
    mine.passwordHash = hashPassword(password);
    db.sessions = db.sessions.filter((s) => s.accountId !== accountId || s.id === keep);
  });
}

export async function linkWallet(accountId: string, address: string): Promise<Account> {
  const account = await withDb((db) => {
    const taken = db.accounts.find((a) => a.walletAddress === address && a.id !== accountId);
    if (taken) throw new HttpError(409, "That wallet is already linked to another account");
    const mine = db.accounts.find((a) => a.id === accountId);
    if (!mine) throw new HttpError(401, "Sign in again");
    mine.walletAddress = address;
    return mine;
  });
  return publicAccount(account);
}
