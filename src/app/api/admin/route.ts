import { publicAccount, requireAdmin } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/api";
import { withDb } from "@/lib/server/db";
import { withReviewer } from "@/lib/server/sellers";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    await requireAdmin();
    const data = await withDb((db) => ({
      orders: [...db.orders].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
      products: [...db.products].sort((a, b) => a.name.localeCompare(b.name)),
      reviews: [...db.reviews]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((review) => withReviewer(db, review)),
      accounts: db.accounts.map((account) => ({
        ...publicAccount(account),
        sessionCount: db.sessions.filter(
          (session) => session.accountId === account.id && Date.parse(session.expiresAt) > Date.now(),
        ).length,
        openReports: db.reports.filter((report) => report.accountId === account.id && report.status === "open").length,
      })),
      support: [...(db.support ?? [])]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((request) => {
          const payout = db.payouts.find((item) => item.id === request.payoutId);
          return {
            ...request,
            accountName: db.accounts.find((account) => account.id === request.accountId)?.name ?? "Removed account",
            amount: payout?.amount,
            fee: payout?.fee,
            net: payout?.net,
            phone: payout?.accountNumber,
            network: payout?.bankName,
          };
        }),
      reports: [...db.reports]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((report) => ({
          ...report,
          accountName: db.accounts.find((account) => account.id === report.accountId)?.name ?? "Removed account",
          reporterName: db.accounts.find((account) => account.id === report.reporterId)?.name ?? "Removed account",
        })),
    }));
    return ok(data);
  });
}
