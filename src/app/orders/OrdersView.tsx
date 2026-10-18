"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatUsdc, shortAddress } from "@/lib/amount";
import { CashOut } from "@/components/CashOut";
import { ImageIcon, StarIcon } from "@/components/Icons";
import { ReportAccount } from "@/components/ReportAccount";
import { api } from "@/lib/client/api";
import {
  escrowClaim,
  escrowDispute,
  escrowRefund,
  escrowRelease,
  refundDirect,
  signAuth,
} from "@/lib/client/stellar";
import { EXPLORER_URL } from "@/lib/config";
import { TRACK_STAGES, type Order, type TrackStage } from "@/lib/types";

function shippingStage(order: Order): TrackStage {
  const latest = [...(order.updates ?? [])].reverse().find(
    (update) => update.stage === "picked-up" || update.stage === "in-transit" || update.stage === "out-for-delivery",
  );
  return latest?.stage ?? "picked-up";
}

const STATUS_LABEL: Record<Order["status"], string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  shipped: "Shipped",
  completed: "Completed",
  disputed: "Refund requested",
  "refund-approved": "Refund approved",
  resolved: "Resolved",
  refunded: "Refunded",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export function OrdersView() {
  const { address, connect, connecting } = useWallet();
  const { account } = useAccount();
  const params = useSearchParams();
  const justOrdered = params.get("new");

  const [tab, setTab] = useState<"buying" | "selling">("buying");
  const [buying, setBuying] = useState<Order[] | null>(null);
  const [selling, setSelling] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<"all" | "paid" | "shipped" | "disputed" | "closed">("all");
  const searchRun = useRef(0);
  const pickedTab = useRef(false);

  function openTab(next: "buying" | "selling") {
    if (next === tab) return;
    searchRun.current += 1;
    setTab(next);
    setQuery("");
    setSearch("");
    setSearching(false);
  }

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const run = ++searchRun.current;
    setSearching(true);
    await new Promise((resolve) => setTimeout(resolve, 280));
    if (run !== searchRun.current) return;
    setSearch(query.trim());
    setSearching(false);
  }

  const load = useCallback(async () => {
    if (!account && !address) return;
    try {
      const [b, s] = account
        ? await api<{ buying: Order[]; selling: Order[] }>("/api/orders?scope=me").then((data) => [data.buying, data.selling] as const)
        : await Promise.all([
            api<{ items: Order[] }>(`/api/orders?buyer=${address}`).then((data) => data.items),
            api<{ items: Order[] }>(`/api/orders?seller=${address}`).then((data) => data.items),
          ]);
      setBuying(b);
      setSelling(s);

      // Escrow can change on-chain (arbiter, deadline); refresh any live ones.
      const live = [...b, ...s].filter(
        (o) => o.mode === "escrow" && ["pending", "paid", "shipped", "disputed", "refund-approved"].includes(o.status),
      );
      const unique = [...new Map(live.map((o) => [o.id, o])).values()];
      const results = await Promise.allSettled(
        unique.map((o) => api<Order>(`/api/orders/${o.id}`, { method: "POST", json: { action: "sync" } })),
      );
      const changed = results.some((r, i) => r.status === "fulfilled" && r.value.status !== unique[i].status);
      if (changed) {
        const [b2, s2] = account
          ? await api<{ buying: Order[]; selling: Order[] }>("/api/orders?scope=me").then((data) => [data.buying, data.selling] as const)
          : await Promise.all([
              api<{ items: Order[] }>(`/api/orders?buyer=${address}`).then((data) => data.items),
              api<{ items: Order[] }>(`/api/orders?seller=${address}`).then((data) => data.items),
            ]);
        setBuying(b2);
        setSelling(s2);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load orders");
    }
  }, [account, address]);

  useEffect(() => {
    setBuying(null);
    setSelling(null);
    load();
  }, [load]);

  useEffect(() => {
    if (pickedTab.current || !buying || !selling) return;
    pickedTab.current = true;
    if (buying.length === 0 && selling.length > 0) setTab("selling");
  }, [buying, selling]);

  if (!account && !address) {
    return (
      <div className="empty">
        <h3>{account ? "Connect your wallet" : "Sign in or connect a wallet"}</h3>
        <p>Orders are kept on your account and paid from your Stellar wallet.</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {!account && (
            <Link href="/sign-in" className="btn">
              Sign in
            </Link>
          )}
          <button className={`btn ${account ? "" : "btn-outline"}`} onClick={connect} disabled={connecting}>
            {connecting && <span className="spinner" />} Connect wallet
          </button>
        </div>
      </div>
    );
  }

  const list = tab === "buying" ? buying : selling;
  const shown = list?.filter((order) => orderMatches(order, search, status)) ?? null;

  return (
    <>
      {justOrdered && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          Payment confirmed. The seller can accept the order and update it until delivery.
        </div>
      )}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {tab === "selling" && selling && <CashOut />}

      <div className="tabs">
        <button className={`tab ${tab === "buying" ? "active" : ""}`} onClick={() => openTab("buying")}>
          Buying {buying ? `(${buying.length})` : ""}
        </button>
        <button className={`tab ${tab === "selling" ? "active" : ""}`} onClick={() => openTab("selling")}>
          Selling {selling ? `(${selling.length})` : ""}
        </button>
      </div>

      <form
        className="search order-search"
        role="search"
        onSubmit={runSearch}
      >
        <input
          type="search"
          placeholder="Search product or tracking number"
          aria-label="Search orders"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={searching}>
          {searching && <span className="spinner" />} Search
        </button>
      </form>
      {searching && <div className="skeleton" style={{ height: 116, marginBottom: 16 }} aria-label="Searching" />}
      <div className="order-filters">
        {(
          [
            ["all", "All"],
            ["paid", "Paid"],
            ["shipped", "Shipped"],
            ["disputed", "Refunds"],
            ["closed", "Closed"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`btn btn-sm ${status === id ? "" : "btn-outline"}`}
            onClick={() => setStatus(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {searching ? null : list === null ? (
        <div className="stack">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton" style={{ height: 116 }} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="empty">
          <h3>{tab === "buying" ? "No purchases yet" : "No sales yet"}</h3>
          <p>
            {tab === "buying" ? (
              <Link href="/shop" className="link-pink">
                Browse the marketplace
              </Link>
            ) : (
              <Link href="/sell" className="link-pink">
                Create your first listing
              </Link>
            )}
          </p>
        </div>
      ) : shown && shown.length === 0 ? (
        <p className="muted">No orders match that search.</p>
      ) : (
        <OrderSections
          list={shown ?? []}
          search={search}
          me={address ?? account?.walletAddress ?? ""}
          accountId={account?.id ?? null}
          accountWallet={account?.walletAddress ?? null}
          connected={address}
          highlight={justOrdered}
          onChanged={load}
        />
      )}
    </>
  );
}

function orderMatches(order: Order, search: string, status: "all" | "paid" | "shipped" | "disputed" | "closed") {
  const term = search.toLowerCase();
  const text = `${order.productName} ${order.trackingNumber} ${order.id} ${order.details?.carrier ?? ""} ${order.details?.reference ?? ""}`.toLowerCase();
  if (term && !text.includes(term)) return false;
  if (status === "all") return true;
  if (status === "closed") {
    return order.status === "completed" || order.status === "resolved" || order.status === "refunded" || order.status === "rejected";
  }
  if (status === "paid") return order.status === "paid";
  if (status === "disputed") return order.status === "disputed" || order.status === "refund-approved";
  return order.status === status;
}

function OrderSections({
  list,
  search,
  me,
  accountId,
  accountWallet,
  connected,
  highlight,
  onChanged,
}: {
  list: Order[];
  search: string;
  me: string;
  accountId: string | null;
  accountWallet: string | null;
  connected: string | null;
  highlight: string | null;
  onChanged: () => Promise<void>;
}) {
  const recent = list.filter(
    (o) => o.status === "completed" || o.status === "resolved" || o.status === "refunded" || o.status === "rejected",
  );
  const open = list.filter((o) => !recent.includes(o));
  const [recentOpen, setRecentOpen] = useState(false);

  useEffect(() => {
    if (search.trim()) setRecentOpen(true);
  }, [search]);

  return (
    <>
      <h2 className="section-title" style={{ fontSize: 18, margin: "8px 0 12px" }}>
        Open orders
      </h2>
      {open.length === 0 ? (
        <p className="muted">No open orders.</p>
      ) : (
        open.map((order) => (
          <OrderCard key={order.id} order={order} me={me} accountId={accountId} accountWallet={accountWallet} connected={connected} highlight={order.id === highlight} onChanged={onChanged} />
        ))
      )}
      <article className={`order${recentOpen ? " is-open" : ""}`} style={{ marginTop: 28 }}>
        <div
          className="order-head"
          style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
          onClick={() => setRecentOpen((value) => !value)}
        >
          <div>
            <h4 style={{ margin: 0 }}>Recent orders</h4>
            <div className="sub">
              {recent.length} finished order{recent.length === 1 ? "" : "s"}
            </div>
          </div>
          <button
            type="button"
            className="order-fold"
            aria-label={recentOpen ? "Fold recent orders" : "Open recent orders"}
            onClick={(event) => {
              event.stopPropagation();
              setRecentOpen((value) => !value);
            }}
          >
            <span className="order-chevron" aria-hidden />
          </button>
        </div>
        {recentOpen && (
          <div className="stack" style={{ padding: "0 16px 16px" }}>
            {recent.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Finished orders, including ones an admin rejected, show up here.
              </p>
            ) : (
              recent.map((order) => (
                <OrderCard key={order.id} order={order} me={me} accountId={accountId} accountWallet={accountWallet} connected={connected} highlight={order.id === highlight} onChanged={onChanged} />
              ))
            )}
          </div>
        )}
      </article>
    </>
  );
}

function OrderCard({
  order,
  me,
  accountId,
  accountWallet,
  connected,
  highlight,
  onChanged,
}: {
  order: Order;
  me: string;
  accountId: string | null;
  accountWallet: string | null;
  connected: string | null;
  highlight: boolean;
  onChanged: () => Promise<void>;
}) {
  const isBuyer = order.buyer === me || (accountId !== null && order.accountId === accountId);
  const accountIsSeller =
    (accountWallet !== null && order.seller === accountWallet) ||
    (accountId !== null && order.sellerAccountId === accountId);
  const isSeller = order.seller === me || accountIsSeller;
  const connectedSeller = connected !== null && order.seller === connected;
  const escrow = order.mode === "escrow";
  const live = order.status === "paid" || order.status === "shipped";
  const canClaim = escrow && live && order.releaseAfter !== null && Date.now() / 1000 >= order.releaseAfter;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<TrackStage>(() => shippingStage(order));
  const [savedDetails, setSavedDetails] = useState(false);
  const [carrier, setCarrier] = useState(order.details?.carrier ?? "");
  const [reference, setReference] = useState(order.details?.reference ?? "");
  const [detailNote, setDetailNote] = useState(order.details?.note ?? "");
  const [disputeNote, setDisputeNote] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const canRequestRefund = isBuyer && ["paid", "shipped", "completed", "resolved"].includes(order.status);
  const [open, setOpen] = useState(highlight);
  const canSaveDetails =
    carrier.trim().length > 0 ||
    reference.trim().length > 0 ||
    detailNote.trim().length > 0 ||
    (location.trim().length >= 2 && note.trim().length >= 2);

  useEffect(() => {
    setCarrier(order.details?.carrier ?? "");
    setReference(order.details?.reference ?? "");
    setDetailNote(order.details?.note ?? "");
    setStage(shippingStage(order));
  }, [order.id, order.updatedAt, order.details?.updatedAt]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const sync = () => api(`/api/orders/${order.id}`, { method: "POST", json: { action: "sync" } });

  async function sellerAuth(action: string) {
    if (accountWallet && accountWallet === order.seller) return undefined;
    if (me !== order.seller) throw new Error("Connect the selling wallet");
    return signAuth(me, action, order.id);
  }

  const accept = () =>
    run("accept", async () => {
      const auth = await sellerAuth("accept");
      await api(`/api/orders/${order.id}`, { method: "POST", json: { action: "accept", auth } });
    });

  const saveDetails = () =>
    run("details", async () => {
      const auth = await sellerAuth("details");
      await api(`/api/orders/${order.id}`, {
        method: "POST",
        json: {
          action: "details",
          auth,
          carrier,
          reference,
          note: detailNote,
          stage,
          location,
          message: note,
        },
      });
      setLocation("");
      setNote("");
      setSavedDetails(true);
    });

  const sellerDispute = () =>
    run("seller-dispute", async () => {
      const auth = await signAuth(me, "seller-dispute", order.id);
      await api(`/api/orders/${order.id}`, {
        method: "POST",
        json: { action: "seller-dispute", auth, message: disputeNote },
      });
    });

  const deliverDirect = () =>
    run("deliver", async () => {
      const auth = await signAuth(me, "deliver", order.id);
      await api(`/api/orders/${order.id}`, { method: "POST", json: { action: "deliver", auth } });
    });

  const release = () =>
    run("release", async () => {
      await escrowRelease(order.id, me);
      await sync();
    });

  const dispute = () => {
    if (!confirm("Freeze the funds and ask the arbiter to step in?")) return;
    return run("dispute", async () => {
      await escrowDispute(order.id, me);
      await sync();
    });
  };

  const refund = () => {
    if (!confirm("Cancel this sale and return the USDC to the buyer?")) return;
    return run("refund", async () => {
      await escrowRefund(order.id, me);
      await sync();
    });
  };

  const requestRefund = () =>
    run("request-refund", async () => {
      await api(`/api/orders/${order.id}`, {
        method: "POST",
        json: { action: "request-refund", message: refundNote },
      });
      setRefundNote("");
    });

  const sendApprovedRefund = () => {
    if (!confirm("Send this USDC back to the buyer?")) return;
    return run("send-refund", async () => {
      const auth = await signAuth(me, "confirm-refund", order.id);
      if (escrow) {
        await escrowRefund(order.id, me);
        await api(`/api/orders/${order.id}`, { method: "POST", json: { action: "confirm-refund", auth } });
      } else {
        const txHash = await refundDirect({
          seller: me,
          buyer: order.buyer,
          total: order.total,
          orderId: order.id,
        });
        await api(`/api/orders/${order.id}`, { method: "POST", json: { action: "confirm-refund", auth, txHash } });
      }
    });
  };

  const claim = () =>
    run("claim", async () => {
      await escrowClaim(order.id, me);
      await sync();
    });

  const review = () =>
    run("review", async () => {
      const ownsAccount = accountId !== null && order.accountId === accountId;
      const auth = ownsAccount ? undefined : await signAuth(me, "review", order.id);
      await api(`/api/orders/${order.id}`, { method: "POST", json: { action: "review", auth, rating, comment } });
    });

  const spinner = (key: string) => (busy === key ? <span className="spinner" /> : null);

  return (
    <div className={`order${open ? " is-open" : ""}`} style={highlight ? { borderColor: "var(--green)", boxShadow: "0 0 0 3px #d9f7ea" } : undefined}>
      <div className="order-head" onClick={() => setOpen((value) => !value)}>
        <div className="order-img">
          {order.productImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={order.productImage} alt="" />
          ) : (
            <div className="placeholder" aria-hidden>
              <ImageIcon size={28} />
            </div>
          )}
        </div>
        <div>
          <h4>
            <Link href={`/products/${order.productId}`} onClick={(event) => event.stopPropagation()}>
              {order.productName}
            </Link>{" "}
            <span className={`status status-${order.status}`}>{STATUS_LABEL[order.status]}</span>
          </h4>
          <div className="sub">
            {order.quantity} × {formatUsdc(order.unitPrice)} USDC · {new Date(order.createdAt).toLocaleDateString()}
          </div>
          {order.review && (
            <div className="sub">
              {isSeller && !isBuyer ? "Buyer review" : "Your review"} · {order.review.rating}/5
              {order.review.comment ? ` · ${order.review.comment}` : ""}
            </div>
          )}
          {order.details && (order.details.carrier || order.details.reference) && (
            <div className="sub">
              {order.details.carrier || "Parcel"}
              {order.details.reference ? ` · ${order.details.reference}` : ""}
            </div>
          )}
        </div>
        <div className="order-money">{formatUsdc(order.total)} USDC</div>
        <button
          type="button"
          className="order-fold"
          aria-label={open ? "Fold this order" : "Open this order"}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
        >
          <span className="order-chevron" aria-hidden />
        </button>
      </div>

      {open && (
      <div className="order-body">
        <div className="order-meta">
        <div className="sub">{escrow ? "Escrow" : "Direct payment"}</div>
        <div className="sub">
          {isBuyer ? (
            <>
              Seller: <Link href={`/sellers/${order.seller}`} className="mono">{shortAddress(order.seller)}</Link>
            </>
          ) : (
            <>
              Buyer: <span className="mono">{shortAddress(order.buyer)}</span>
            </>
          )}{" "}
          · {new Date(order.createdAt).toLocaleString()}
        </div>
        <div className="sub">
          Tracking <span className="mono">{order.trackingNumber}</span>
          {order.acceptedAt && !order.closedAt ? " · Accepted" : ""}
          {order.closedAt ? " · Delivery closed" : ""}
        </div>
        {order.details && (order.details.carrier || order.details.reference || order.details.note) && (
          <div className="sub">
            {order.details.carrier && <span>Carrier {order.details.carrier}</span>}
            {order.details.reference && <span>{order.details.carrier ? " · " : ""}Reference {order.details.reference}</span>}
            {order.details.note && <div>{order.details.note}</div>}
          </div>
        )}
        {order.txHash && (
          <div className="sub">
            Tx:{" "}
            <a className="mono link-pink" href={`${EXPLORER_URL}/tx/${order.txHash}`} target="_blank" rel="noreferrer">
              {order.txHash.slice(0, 12)}…
            </a>
          </div>
        )}
        {escrow && live && order.releaseAfter && (
          <div className="sub">
            Seller can claim funds after {new Date(order.releaseAfter * 1000).toLocaleDateString()} if there is no dispute.
          </div>
        )}
        {order.status === "disputed" && (
          <div className="sub">
            {order.disputeMessage
              ? `Refund request: ${order.disputeMessage}`
              : "The buyer asked for a refund."}{" "}
            The marketplace is reviewing it. The seller sends the money back only after it is approved.
          </div>
        )}
        {order.status === "refund-approved" && (
          <div className="sub">
            The marketplace approved this refund. The seller still has to send {formatUsdc(order.total)} USDC back to the buyer.
          </div>
        )}
        {order.resolutionNote && <div className="sub">Decision: {order.resolutionNote}</div>}
        {error && (
          <div className="alert alert-error" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}
        </div>

      <div className="order-actions">
        {order.status === "pending" && escrow && isBuyer && (
          <button className="btn btn-sm btn-outline" disabled={!!busy} onClick={() => run("sync", sync)}>
            {spinner("sync")} Check payment
          </button>
        )}

        {isSeller && order.status === "paid" && !order.acceptedAt && !order.closedAt && (
          <button className="btn btn-sm" disabled={!!busy} onClick={accept}>
            {spinner("accept")} Accept order
          </button>
        )}
        {connectedSeller && escrow && live && (
          <button className="btn btn-sm btn-outline" disabled={!!busy} onClick={refund}>
            {spinner("refund")} Cancel &amp; refund
          </button>
        )}
        {connectedSeller && canClaim && (
          <button className="btn btn-sm btn-green" disabled={!!busy} onClick={claim}>
            {spinner("claim")} Claim funds
          </button>
        )}

        {isBuyer && live && escrow && (
          <button className="btn btn-sm btn-green" disabled={!!busy} onClick={release}>
            {spinner("release")} Confirm delivery
          </button>
        )}
        {isBuyer && live && !escrow && (
          <button className="btn btn-sm btn-green" disabled={!!busy} onClick={deliverDirect}>
            {spinner("deliver")} Confirm delivery
          </button>
        )}
        {connectedSeller && live && escrow && !order.closedAt && (
          <button className="btn btn-sm btn-danger" disabled={!!busy} onClick={dispute}>
            {spinner("dispute")} Open dispute
          </button>
        )}
        {connectedSeller && order.status === "refund-approved" && (
          <button className="btn btn-sm" disabled={!!busy} onClick={sendApprovedRefund}>
            {spinner("send-refund")} Send refund
          </button>
        )}
        {isBuyer && order.sellerAccountId && <ReportAccount accountId={order.sellerAccountId} label="Report seller" />}
        {isSeller && order.buyerAccountId && <ReportAccount accountId={order.buyerAccountId} label="Report buyer" />}
      </div>

      <Tracking order={order} />

      {isSeller && !order.closedAt && (order.status === "paid" || order.status === "shipped") && (
        <form
          className="review-box"
          onSubmit={(e) => {
            e.preventDefault();
            saveDetails();
          }}
        >
          <b>Update order details</b>
          <p className="sub">
            Add the carrier, a parcel reference, and a note for the buyer. The shipping step updates tracking even when the location is still blank.
            The price and quantity stay as they were ordered.
            {!order.acceptedAt ? " Saving this accepts the order." : ""} You can keep updating until delivery is closed.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="input"
              style={{ flex: "1 1 140px" }}
              placeholder="Carrier, for example DHL"
              maxLength={40}
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              aria-label="Carrier"
            />
            <input
              className="input"
              style={{ flex: "1 1 140px" }}
              placeholder="Parcel reference"
              maxLength={40}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              aria-label="Parcel reference"
            />
          </div>
          <textarea
            className="textarea"
            style={{ minHeight: 70, marginTop: 8 }}
            placeholder="Note for the buyer"
            maxLength={300}
            value={detailNote}
            onChange={(e) => setDetailNote(e.target.value)}
          />
          <select className="input" style={{ marginTop: 8 }} value={stage} onChange={(e) => setStage(e.target.value as TrackStage)} aria-label="Shipping step">
            {TRACK_STAGES.filter((s) => s.id === "picked-up" || s.id === "in-transit" || s.id === "out-for-delivery").map(
              (s) => (
                <option key={s.id} value={s.id}>
                  {s.label} · {s.progress}%
                </option>
              ),
            )}
          </select>
          <input
            className="input"
            style={{ marginTop: 8 }}
            placeholder="Location, for example Johannesburg hub"
            maxLength={80}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            aria-label="Location"
          />
          <textarea
            className="textarea"
            style={{ minHeight: 70, marginTop: 8 }}
            placeholder="Shipping message for the buyer"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="btn btn-sm" style={{ marginTop: 8 }} disabled={!!busy || !canSaveDetails}>
            {spinner("details")} Save details
          </button>
          {savedDetails && !busy && <p className="sub">Saved. The shipping step is on this order.</p>}
        </form>
      )}

      {canRequestRefund && (
        <form
          className="review-box"
          onSubmit={(e) => {
            e.preventDefault();
            requestRefund();
          }}
        >
          <b>Request a refund</b>
          <p className="sub">
            Tell the marketplace why you want the money back. If the request is approved, the seller sends the USDC to you.
          </p>
          <textarea
            className="textarea"
            style={{ minHeight: 70 }}
            placeholder="Why you want a refund"
            maxLength={300}
            value={refundNote}
            onChange={(e) => setRefundNote(e.target.value)}
            required
          />
          <button className="btn btn-sm btn-danger" style={{ marginTop: 8 }} disabled={!!busy || refundNote.trim().length < 2}>
            {spinner("request-refund")} Request a refund
          </button>
        </form>
      )}

      {connectedSeller && order.status === "completed" && (
        <form
          className="review-box"
          onSubmit={(e) => {
            e.preventDefault();
            if (!confirm("Open a dispute? This delivery leaves Recent orders.")) return;
            sellerDispute();
          }}
        >
          <b>Delivery is closed</b>
          <p className="sub">It stays closed unless you open a dispute.</p>
          <textarea
            className="textarea"
            style={{ minHeight: 70 }}
            placeholder="Why are you disputing this delivery?"
            maxLength={300}
            value={disputeNote}
            onChange={(e) => setDisputeNote(e.target.value)}
            required
          />
          <button className="btn btn-sm btn-danger" style={{ marginTop: 8 }} disabled={!!busy}>
            {spinner("seller-dispute")} Open dispute
          </button>
        </form>
      )}

      {isBuyer && order.review && (
        <div className="review-box">
          <b>Your review</b>
          <div className="star-pick" aria-label={`${order.review.rating} out of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={n <= order.review!.rating ? "on" : ""}>
                <StarIcon size={20} />
              </span>
            ))}
          </div>
          {order.review.comment && <p style={{ margin: "8px 0 0" }}>{order.review.comment}</p>}
        </div>
      )}

      {isBuyer && (order.status === "completed" || order.status === "resolved") && !order.reviewed && (
        <div className="review-box">
          <b>Rate this seller</b>
          <div className="star-pick">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className={n <= rating ? "on" : ""} onClick={() => setRating(n)} aria-label={`${n} stars`}>
                <StarIcon size={24} />
              </button>
            ))}
          </div>
          <textarea
            className="textarea"
            style={{ minHeight: 70 }}
            maxLength={500}
            placeholder="How was your experience? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="btn btn-sm" style={{ marginTop: 8 }} disabled={!!busy} onClick={review}>
            {spinner("review")} Submit review
          </button>
        </div>
      )}
      </div>
      )}
    </div>
  );
}

function Tracking({ order }: { order: Order }) {
  const updates = order.updates ?? [];
  const progress = updates.length ? updates[updates.length - 1].progress : 0;
  return (
    <div className="track">
      <div className="track-bar" aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="sub">{progress}% of the way</div>
      {updates.length > 0 && (
        <ol className="track-list">
          {updates.map((update) => {
            const label = TRACK_STAGES.find((s) => s.id === update.stage)?.label ?? update.stage;
            return (
              <li key={update.id}>
                <b>{label}</b>
                {update.location ? ` · ${update.location}` : ""} · {new Date(update.at).toLocaleString()}
                <div>{update.message}</div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
