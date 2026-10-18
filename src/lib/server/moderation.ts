import "server-only";
import { randomBytes } from "crypto";
import { banMessage } from "./auth";
import { withDb, type AccountRecord, type DB } from "./db";
import { HttpError, isValidAddress } from "./stellar";
import type { Report } from "../types";

function findAccount(db: DB, accountId: string): AccountRecord {
  const account = db.accounts.find((item) => item.id === accountId);
  if (!account) throw new HttpError(404, "Account not found");
  return account;
}

export function pullListings(db: DB, account: AccountRecord) {
  if (!account.walletAddress) return;
  for (const product of db.products) {
    if (product.sellerAddress === account.walletAddress && product.active) {
      product.active = false;
      product.pulledForBan = true;
    }
  }
}

export function restoreListings(db: DB, account: AccountRecord) {
  if (!account.walletAddress) return;
  for (const product of db.products) {
    if (product.sellerAddress === account.walletAddress && product.pulledForBan) {
      product.active = true;
      product.pulledForBan = false;
    }
  }
}

export function banAccount(db: DB, account: AccountRecord, reason: string) {
  if (account.admin) throw new HttpError(409, "Admin accounts cannot be banned");
  account.banned = true;
  account.banReason = reason;
  account.bannedAt = new Date().toISOString();
  db.sessions = db.sessions.filter((session) => session.accountId !== account.id);
  pullListings(db, account);
}

export async function fileReport(input: {
  reporterId: string;
  accountId?: string | null;
  address?: string | null;
  reason: string;
}): Promise<Report> {
  return withDb((db) => {
    const target = input.accountId
      ? findAccount(db, input.accountId)
      : isValidAddress(input.address)
        ? db.accounts.find((item) => item.walletAddress === input.address)
        : undefined;
    if (!target) throw new HttpError(404, "That person does not have a marketplace account");
    if (target.id === input.reporterId) throw new HttpError(400, "You cannot report your own account");
    if (target.admin) throw new HttpError(400, "Admin accounts are not reported here");
    if (target.banned) throw new HttpError(409, "That account is already banned");
    const duplicate = db.reports.some(
      (report) => report.accountId === target.id && report.reporterId === input.reporterId && report.status === "open",
    );
    if (duplicate) throw new HttpError(409, "You already reported this account");
    const report: Report = {
      id: randomBytes(8).toString("hex"),
      accountId: target.id,
      reporterId: input.reporterId,
      reason: input.reason,
      status: "open",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    db.reports.push(report);
    return report;
  });
}

export async function resolveReport(reportId: string, action: "ban" | "dismiss", adminId: string): Promise<Report> {
  return withDb((db) => {
    const report = db.reports.find((item) => item.id === reportId);
    if (!report) throw new HttpError(404, "Report not found");
    if (report.status !== "open") throw new HttpError(409, "This report is already closed");
    const account = findAccount(db, report.accountId);
    if (action === "ban") {
      if (account.id === adminId) throw new HttpError(409, "You cannot ban your own account");
      banAccount(db, account, report.reason);
      report.status = "banned";
    } else {
      report.status = "dismissed";
    }
    report.resolvedAt = new Date().toISOString();
    return { ...report };
  });
}

export async function unbanAccount(accountId: string): Promise<void> {
  await withDb((db) => {
    const account = findAccount(db, accountId);
    account.banned = false;
    account.banReason = null;
    account.bannedAt = null;
    restoreListings(db, account);
  });
}

export { banMessage };
