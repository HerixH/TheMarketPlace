"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUsdc, isValidPrice } from "@/lib/amount";
import { api } from "@/lib/client/api";
import { platformFee, PLATFORM_FEE_PERCENT } from "@/lib/fees";
import type { Payout } from "@/lib/types";
import { detectZmOperator, zambiaLocalNumber, type ZmOperator } from "@/lib/zm-mobile";

interface LencoBalance {
  salesVolume: string;
  paidOut: string;
  available: string;
  feePercent: number;
  payouts: Payout[];
}

export function CashOut() {
  const [balance, setBalance] = useState<LencoBalance | null>(null);
  const [amount, setAmount] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    const next = await api<LencoBalance>("/api/payouts");
    setBalance(next);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not load the Lenco balance"));
  }, [load]);

  const operator: ZmOperator | null = detectZmOperator(accountNumber);
  const localNumber = zambiaLocalNumber(accountNumber);

  useEffect(() => {
    if (!localNumber || !operator) {
      setAccountName("");
      setLooking(false);
      setLookupDone(false);
      return;
    }
    let cancelled = false;
    setLooking(true);
    setLookupDone(false);
    api<{ accountName: string }>(`/api/payouts/resolve?phone=${encodeURIComponent(localNumber)}`)
      .then((next) => {
        if (!cancelled) setAccountName(next.accountName);
      })
      .catch(() => {
        if (!cancelled) setAccountName("");
      })
      .finally(() => {
        if (!cancelled) {
          setLooking(false);
          setLookupDone(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [localNumber, operator]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!operator || !localNumber || !accountName) {
      setError("Enter a 10-digit Airtel, MTN, or Zamtel number.");
      return;
    }
    setBusy(true);
    try {
      const next = await api<LencoBalance>("/api/payouts", {
        method: "POST",
        json: { amount, accountNumber: localNumber },
      });
      setBalance(next);
      setAmount("");
      setAccountNumber("");
      setAccountName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cash out");
    } finally {
      setBusy(false);
    }
  }

  if (!balance) {
    return error ? <div className="alert alert-error">{error}</div> : <div className="skeleton" style={{ height: 120 }} />;
  }

  const none = Number(balance.available) <= 0;
  const quote = isValidPrice(amount) ? platformFee(amount) : null;
  const feePercent = balance.feePercent || PLATFORM_FEE_PERCENT;

  return (
    <div className="panel stack" style={{ marginBottom: 16 }}>
      <div className="wallet-balances">
        <div className="balance-tile">
          <span>Sales volume</span>
          <strong>{formatUsdc(balance.salesVolume)} USDC</strong>
          <em>Held in Lenco until you cash out</em>
        </div>
        <div className="balance-tile">
          <span>Available</span>
          <strong>{formatUsdc(balance.available)} USDC</strong>
          <em>
            {formatUsdc(balance.paidOut)} already cashed out · platform fee {feePercent}%
          </em>
        </div>
      </div>
      <form className="stack" onSubmit={submit}>
        <input
          className="input"
          inputMode="decimal"
          placeholder="Amount in USDC"
          aria-label="Cash out amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="input"
            style={{ flex: "1 1 180px" }}
            placeholder="097 000 0000"
            aria-label="Phone number"
            inputMode="tel"
            autoComplete="off"
            spellCheck={false}
            maxLength={16}
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value)}
            required
          />
          <span className="muted" style={{ fontSize: 12, minWidth: 72 }}>
            {accountNumber.trim().length === 0 ? "Airtel, MTN, or Zamtel" : operator ?? "Unknown number"}
          </span>
        </div>
        {operator && accountNumber.trim().length > 0 && !localNumber && (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {operator} numbers are 10 digits.
          </p>
        )}
        {localNumber && (looking || !lookupDone) && (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Checking the account name…
          </p>
        )}
        {localNumber && lookupDone && (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {accountName || "No name on this number"}
          </p>
        )}
        {quote && (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Platform fee {formatUsdc(quote.fee)} USDC · you receive {formatUsdc(quote.net)} USDC
          </p>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-sm" disabled={busy || looking || none || !accountName}>
          {busy && <span className="spinner" />} {none ? "Nothing to cash out" : "Cash out"}
        </button>
      </form>
      {balance.payouts.length > 0 && (
        <div className="stack">
          <form
            className="search order-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(query.trim());
              setOpenId(null);
              setHistoryOpen(true);
            }}
          >
            <input
              type="search"
              placeholder="Search name, number, network, or amount"
              aria-label="Search cash outs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit">Search</button>
          </form>
          <article className={`order${historyOpen ? " is-open" : ""}`}>
            <div
              className="order-head"
              style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
              onClick={() => setHistoryOpen((value) => !value)}
            >
              <div>
                <h4 style={{ margin: 0 }}>Cash outs</h4>
                <div className="sub">
                  {balance.payouts.length} transaction{balance.payouts.length === 1 ? "" : "s"}
                </div>
              </div>
              <button
                type="button"
                className="order-fold"
                aria-label={historyOpen ? "Fold cash outs" : "Open cash outs"}
                onClick={(event) => {
                  event.stopPropagation();
                  setHistoryOpen((value) => !value);
                }}
              >
                <span className="order-chevron" aria-hidden />
              </button>
            </div>
            {historyOpen && (
              <div className="stack" style={{ padding: "0 16px 16px" }}>
                {shownPayouts(balance.payouts, search).length === 0 ? (
                  <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                    No cash outs match that search.
                  </p>
                ) : (
                  shownPayouts(balance.payouts, search).map((payout) => (
                    <PayoutAudit
                      key={payout.id}
                      payout={payout}
                      open={openId === payout.id}
                      onToggle={() => setOpenId((current) => (current === payout.id ? null : payout.id))}
                      onSupported={load}
                    />
                  ))
                )}
              </div>
            )}
          </article>
        </div>
      )}
    </div>
  );
}

function shownPayouts(payouts: Payout[], search: string): Payout[] {
  const term = search.trim().toLowerCase();
  if (!term) return payouts;
  return payouts.filter((payout) => {
    const hay = [
      payout.id,
      payout.accountName,
      payout.accountNumber,
      payout.bankName,
      payout.amount,
      payout.fee,
      payout.net,
      payout.method,
      new Date(payout.createdAt).toLocaleString(),
    ]
      .join(" ")
      .toLowerCase();
    return term.split(/\s+/).every((word) => hay.includes(word));
  });
}

function PayoutAudit({
  payout,
  open,
  onToggle,
  onSupported,
}: {
  payout: Payout;
  open: boolean;
  onToggle: () => void;
  onSupported: () => Promise<void>;
}) {
  const when = new Date(payout.createdAt).toLocaleString();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function askSupport(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/api/support", { method: "POST", json: { payoutId: payout.id, message } });
      setMessage("");
      setSent(true);
      await onSupported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach support");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`order${open ? " is-open" : ""}`}>
      <div className="order-head" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }} onClick={onToggle}>
        <div>
          <h4 style={{ margin: 0 }}>
            {formatUsdc(payout.amount)} USDC · {payout.accountName}
          </h4>
          <div className="sub">
            {payout.bankName} {payout.accountNumber}
          </div>
        </div>
        <button
          type="button"
          className="order-fold"
          aria-label={open ? "Fold this cash out" : "Open this cash out"}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          <span className="order-chevron" aria-hidden />
        </button>
      </div>
      {open && (
        <div className="stack" style={{ padding: "0 16px 16px" }}>
          <dl className="stack" style={{ margin: 0 }}>
            <AuditRow label="Transaction" value={payout.id} mono />
            <AuditRow label="When" value={when} />
            <AuditRow label="Taken from Lenco" value={`${formatUsdc(payout.amount)} USDC`} />
            <AuditRow label="Platform fee" value={`${formatUsdc(payout.fee)} USDC`} />
            <AuditRow label="Received" value={`${formatUsdc(payout.net)} USDC`} />
            <AuditRow label="Account name" value={payout.accountName} />
            <AuditRow label="Network" value={payout.bankName} />
            <AuditRow label="Number" value={payout.accountNumber} />
            <AuditRow label="Paid from" value="Lenco balance" />
          </dl>
          {(payout.support ?? []).length > 0 && (
            <div className="support-thread">
              {[...(payout.support ?? [])].reverse().map((item) => (
                <div key={item.createdAt} style={{ display: "contents" }}>
                  <div className="support-bubble you">
                    <b>You</b>
                    <p>{item.message}</p>
                    <time>{new Date(item.createdAt).toLocaleString()}</time>
                  </div>
                  {item.reply ? (
                    <div className="support-bubble desk">
                      <b>Support</b>
                      <p>{item.reply}</p>
                      <time>{item.repliedAt ? new Date(item.repliedAt).toLocaleString() : ""}</time>
                    </div>
                  ) : (
                    item.status !== "closed" && <span className="support-pill wait">Waiting for a reply</span>
                  )}
                  {item.status === "closed" && <span className="support-pill closed">Closed</span>}
                </div>
              ))}
            </div>
          )}
          <form className="stack" onSubmit={askSupport}>
            <div className="support-compose">
              <textarea
                className="textarea"
                maxLength={500}
                placeholder="Message support"
                aria-label="Support message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <button className="btn btn-sm" disabled={busy || message.trim().length < 2}>
                {busy && <span className="spinner" />} Send
              </button>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            {sent && <span className="support-pill closed">Sent to support</span>}
          </form>
        </div>
      )}
    </article>
  );
}

function AuditRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span className="muted" style={{ fontSize: 12 }}>
        {label}
      </span>
      <span className={mono ? "mono" : undefined} style={{ fontSize: 12, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}
