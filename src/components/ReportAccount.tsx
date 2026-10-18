"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { api } from "@/lib/client/api";

export function ReportAccount({
  accountId,
  address,
  label,
}: {
  accountId?: string | null;
  address?: string | null;
  label: string;
}) {
  const { account } = useAccount();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (account?.admin) return null;
  if (account?.id && accountId && account.id === accountId) return null;
  if (done) return <p className="muted" style={{ margin: 0 }}>Report sent. The marketplace will review it.</p>;

  return (
    <div className="review-box">
      {!open ? (
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setOpen(true)}>
          {label}
        </button>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!account) return;
            setBusy(true);
            setError(null);
            try {
              await api("/api/reports", { method: "POST", json: { accountId: accountId || undefined, address: address || undefined, reason } });
              setDone(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not send the report");
            } finally {
              setBusy(false);
            }
          }}
        >
          <b>{label}</b>
          <p className="sub">Describe the marketplace violation. An admin reviews the report before any ban.</p>
          {!account && (
            <p className="sub">
              <Link href="/sign-in" className="link-pink">Sign in</Link> to send a report.
            </p>
          )}
          <textarea
            className="textarea"
            style={{ minHeight: 70 }}
            placeholder="What rule was broken?"
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            disabled={!account}
          />
          {error && <div className="alert alert-error" style={{ marginTop: 8 }}>{error}</div>}
          <button className="btn btn-sm btn-danger" style={{ marginTop: 8 }} disabled={!account || busy || reason.trim().length < 10}>
            {busy && <span className="spinner" />} Send report
          </button>
        </form>
      )}
    </div>
  );
}
