"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { formatUsdc, shortAddress } from "@/lib/amount";
import { api } from "@/lib/client/api";
import { CATEGORIES } from "@/lib/constants";
import { ESCROW_ENABLED, NETWORK_NAME, USDC_CODE } from "@/lib/config";
import { TRACK_STAGES, type Account, type Order, type Product, type Report, type Review, type SupportRequest, type TrackStage } from "@/lib/types";

type Tab = "overview" | "orders" | "disputes" | "listings" | "accounts" | "sellers" | "reviews" | "reports" | "support";

type AdminAccount = Account & { sessionCount: number; openReports: number };

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

const TRACK_CHOICES = TRACK_STAGES.filter((stage) => stage.id !== "placed" && stage.id !== "delivered");

function searchPlaceholder(tab: Tab) {
  if (tab === "listings") return "Search listings";
  if (tab === "accounts") return "Search name or email";
  if (tab === "sellers") return "Search sellers";
  if (tab === "reviews") return "Search reviews";
  if (tab === "reports") return "Search reports";
  if (tab === "support") return "Search support";
  if (tab === "disputes") return "Search disputes";
  return "Search orders, tracking numbers, listings";
}

function firstMatch(
  raw: string,
  orders: Order[],
  products: Product[],
  accounts: AdminAccount[],
  sellers: { name: string; address: string }[],
  reviews: Review[],
): Tab {
  const term = raw.toLowerCase();
  if (products.some((product) => `${product.name} ${product.category} ${product.sellerName}`.toLowerCase().includes(term))) {
    return "listings";
  }
  if (orders.some((order) => matchesOrder(order, term))) return "orders";
  if (accounts.some((item) => `${item.name} ${item.email}`.toLowerCase().includes(term))) return "accounts";
  if (sellers.some((seller) => `${seller.name} ${seller.address}`.toLowerCase().includes(term))) return "sellers";
  if (reviews.some((review) => `${review.comment} ${review.seller}`.toLowerCase().includes(term))) return "reviews";
  return "overview";
}

function matchesOrder(order: Order, term: string) {
  if (!term) return true;
  return `${order.productName} ${order.trackingNumber} ${order.buyer} ${order.seller} ${order.id} ${order.status}`
    .toLowerCase()
    .includes(term);
}

export function AdminView() {
  const { account, loading } = useAccount();
  const [tab, setTab] = useState<Tab>("overview");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [support, setSupport] = useState<SupportRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [focusOrder, setFocusOrder] = useState<string | null>(null);
  const [statFocus, setStatFocus] = useState<"admins" | "hidden" | null>(null);
  const searchRun = useRef(0);

  function openTab(id: Tab) {
    if (id === tab && statFocus === null) return;
    searchRun.current += 1;
    setTab(id);
    setStatFocus(null);
    setQuery("");
    setSearch("");
    setSearching(false);
  }

  function openStat(id: Tab, focus: "admins" | "hidden" | null = null) {
    searchRun.current += 1;
    setSearching(false);
    setQuery("");
    setSearch("");
    setError(null);
    setStatFocus(focus);
    setTab(id);
  }

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const next = query.trim();
    const run = ++searchRun.current;
    setSearching(true);
    await new Promise((resolve) => setTimeout(resolve, 280));
    if (run !== searchRun.current) return;
    setSearch(next);
    if (tab === "overview" && next) {
      setTab(firstMatch(next, orders ?? [], products ?? [], accounts ?? [], sellers, reviews ?? []));
    }
    setSearching(false);
  }

  const load = useCallback(async () => {
    const data = await api<{
      orders: Order[];
      products: Product[];
      accounts: AdminAccount[];
      reviews: Review[];
      reports: Report[];
      support: SupportRequest[];
    }>("/api/admin");
    setOrders(data.orders);
    setProducts(data.products);
    setAccounts(data.accounts);
    setReviews(data.reviews);
    setReports(data.reports);
    setSupport(data.support ?? []);
  }, []);

  useEffect(() => {
    if (!account?.admin) return;
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not load admin"));
  }, [account, load]);

  useEffect(() => {
    if (tab !== "orders" || !focusOrder) return;
    document.getElementById(`admin-order-${focusOrder}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [tab, focusOrder, orders]);

  function openReviewedOrder(orderId: string) {
    if (!(orders ?? []).some((order) => order.id === orderId)) {
      setError("That order is no longer on the books.");
      return;
    }
    searchRun.current += 1;
    setSearching(false);
    setQuery("");
    setSearch("");
    setError(null);
    setTab("orders");
    setFocusOrder(orderId);
  }

  const disputes = (orders ?? []).filter((order) => order.status === "disputed" || order.status === "refund-approved");
  const sellers = useMemo(() => sellerRows(products ?? [], orders ?? [], reviews ?? []), [products, orders, reviews]);
  const term = search.trim().toLowerCase();
  const foundOrders = (orders ?? []).filter((order) => matchesOrder(order, term));
  const foundDisputes = disputes.filter((order) => matchesOrder(order, term));
  const foundProducts = (products ?? []).filter((product) => {
    if (statFocus === "hidden" && product.active) return false;
    if (tab === "listings" && statFocus !== "hidden" && !product.active) return false;
    return !term || `${product.name} ${product.category} ${product.sellerName}`.toLowerCase().includes(term);
  });
  const foundAccounts = (accounts ?? []).filter((item) => {
    if (statFocus === "admins" && !item.admin) return false;
    return !term || `${item.name} ${item.email} ${item.walletAddress ?? ""}`.toLowerCase().includes(term);
  });
  const foundSellers = sellers.filter(
    (seller) => !term || `${seller.name} ${seller.address}`.toLowerCase().includes(term),
  );
  const foundReviews = (reviews ?? []).filter(
    (review) => !term || `${review.comment} ${review.seller} ${review.buyer}`.toLowerCase().includes(term),
  );
  const openReports = (reports ?? []).filter((report) => report.status === "open");
  const foundReports = (reports ?? []).filter(
    (report) => !term || `${report.reason} ${report.accountName ?? ""} ${report.reporterName ?? ""}`.toLowerCase().includes(term),
  );
  const openSupport = (support ?? []).filter((item) => item.status !== "closed");
  const foundSupport = (support ?? []).filter(
    (item) => !term || `${item.message} ${item.accountName ?? ""} ${item.payoutId} ${item.reply ?? ""}`.toLowerCase().includes(term),
  );

  if (loading) return <div className="skeleton" style={{ height: 180 }} />;

  if (!account) {
    return (
      <div className="empty">
        <h3>Sign in as the owner</h3>
        <p>The admin side is only for the owner of The Market Place.</p>
        <Link href="/sign-in" className="btn">
          Sign in
        </Link>
      </div>
    );
  }

  if (!account.admin) {
    return (
      <div className="empty">
        <h3>This account is not an admin</h3>
        <p>Shoppers and sellers stay on their own orders. The owner manages the whole system from here.</p>
        <Link href="/account" className="btn btn-outline">
          Back to account
        </Link>
      </div>
    );
  }

  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ["orders", `Orders (${orders?.length ?? 0})`],
    ["disputes", `Disputes (${disputes.length})`],
    ["listings", `Listings (${products?.length ?? 0})`],
    ["accounts", `Accounts (${accounts?.length ?? 0})`],
    ["sellers", `Sellers (${sellers.length})`],
    ["reviews", `Reviews (${reviews?.length ?? 0})`],
    ["reports", `Reports (${openReports.length})`],
    ["support", `Support (${openSupport.length})`],
  ];

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        You own The Market Place. Orders, listings, accounts, sellers, and reviews are all here. A dispute decision is
        stored on the order. USDC still moves on Stellar only when escrow is live and the arbiter wallet signs.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => openTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <form
        className="search order-search"
        role="search"
        onSubmit={runSearch}
      >
        <input
          type="search"
          placeholder={searchPlaceholder(tab)}
          aria-label="Search the admin console"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={searching}>
          {searching && <span className="spinner" />} Search
        </button>
      </form>
      {searching && <div className="skeleton" style={{ height: 140 }} aria-label="Searching" />}

      {!searching && tab === "overview" && (
        <>
          <Overview
            orders={orders}
            products={products}
            accounts={accounts}
            reviews={reviews}
            disputes={disputes.length}
            reports={openReports.length}
            support={openSupport}
            onOpen={openStat}
            onDone={load}
          />
          {term &&
            foundOrders.length + foundProducts.length + foundAccounts.length + foundSellers.length + foundReviews.length ===
              0 && <p className="muted">Nothing matches that search.</p>}
        </>
      )}

      {!searching && tab === "orders" && (
        <section className="stack">
          {orders === null && <div className="skeleton" style={{ height: 120 }} />}
          {orders?.length === 0 && <p className="muted">No orders yet.</p>}
          {orders && orders.length > 0 && foundOrders.length === 0 && <p className="muted">No orders match that search.</p>}
          {foundOrders.map((order) => (
            <OrderCard key={order.id} order={order} highlight={order.id === focusOrder} onDone={load} onError={setError} />
          ))}
        </section>
      )}

      {!searching && tab === "disputes" && (
        <section className="stack">
          {orders === null && <div className="skeleton" style={{ height: 120 }} />}
          {orders && disputes.length === 0 && <p className="muted">No open disputes.</p>}
          {disputes.length > 0 && foundDisputes.length === 0 && <p className="muted">No disputes match that search.</p>}
          {foundDisputes.map((order) => (
            <OrderCard key={order.id} order={order} onDone={load} onError={setError} />
          ))}
        </section>
      )}

      {!searching && tab === "listings" && (
        <section className="stack">
          {products === null && <div className="skeleton" style={{ height: 120 }} />}
          {statFocus === "hidden" && foundProducts.length === 0 && <p className="muted">No hidden listings.</p>}
          {statFocus !== "hidden" && products && products.length > 0 && foundProducts.length === 0 && (
            <p className="muted">No listings match that search.</p>
          )}
          {foundProducts.map((product) => (
            <ListingRow key={product.id} product={product} onDone={load} onError={setError} />
          ))}
        </section>
      )}

      {!searching && tab === "accounts" && (
        <section className="stack">
          {statFocus === "admins" && foundAccounts.length === 0 && <p className="muted">No admin accounts.</p>}
          {statFocus !== "admins" && accounts && accounts.length > 0 && foundAccounts.length === 0 && (
            <p className="muted">No accounts match that search.</p>
          )}
          {foundAccounts.map((item) => (
            <AccountRow key={item.id} item={item} selfId={account.id} onDone={load} onError={setError} />
          ))}
        </section>
      )}

      {!searching && tab === "sellers" && (
        <section className="stack">
          {sellers.length === 0 && <p className="muted">No sellers yet.</p>}
          {sellers.length > 0 && foundSellers.length === 0 && <p className="muted">No sellers match that search.</p>}
          {foundSellers.map((seller) => (
            <Link key={seller.address} href={`/sellers/${seller.address}`} className="panel seller-row">
              <b>{seller.name}</b>
              <div className="muted" style={{ fontSize: 13 }}>
                <span className="mono link-pink">{shortAddress(seller.address)}</span>
                {" · "}
                {seller.listings} listings · {seller.orders} orders · {seller.reviews} reviews
                {seller.rating !== null ? ` · ${seller.rating.toFixed(1)} average` : ""}
              </div>
            </Link>
          ))}
        </section>
      )}

      {!searching && tab === "reviews" && (
        <section className="stack">
          {reviews?.length === 0 && <p className="muted">No reviews yet.</p>}
          {reviews && reviews.length > 0 && foundReviews.length === 0 && <p className="muted">No reviews match that search.</p>}
          {foundReviews.map((review) => (
            <ReviewRow
              key={review.id}
              review={review}
              order={(orders ?? []).find((item) => item.id === review.orderId)}
              onOpen={openReviewedOrder}
              onDone={load}
              onError={setError}
            />
          ))}
        </section>
      )}

      {!searching && tab === "support" && (
        <section className="stack">
          <p className="muted" style={{ margin: 0 }}>
            Help requests about cash outs. Closing one does not change a dispute or the cash out.
          </p>
          {support?.length === 0 && <p className="muted">No support messages yet.</p>}
          {support && support.length > 0 && foundSupport.length === 0 && <p className="muted">No support messages match that search.</p>}
          {foundSupport.map((item) => (
            <SupportNote key={item.id} item={item} onDone={load} />
          ))}
        </section>
      )}

      {!searching && tab === "reports" && (
        <section className="stack">
          {reports?.length === 0 && <p className="muted">No reports yet.</p>}
          {reports && reports.length > 0 && foundReports.length === 0 && <p className="muted">No reports match that search.</p>}
          {foundReports.map((report) => (
            <ReportRow key={report.id} report={report} onDone={load} onError={setError} />
          ))}
        </section>
      )}
    </div>
  );
}

function Overview({
  orders,
  products,
  accounts,
  reviews,
  disputes,
  reports,
  support,
  onOpen,
  onDone,
}: {
  orders: Order[] | null;
  products: Product[] | null;
  accounts: AdminAccount[] | null;
  reviews: Review[] | null;
  disputes: number;
  reports: number;
  support: SupportRequest[];
  onOpen: (tab: Tab, focus?: "admins" | "hidden" | null) => void;
  onDone: () => Promise<void>;
}) {
  const paid = (orders ?? []).filter((order) =>
    ["paid", "shipped", "completed", "resolved"].includes(order.status),
  );
  const volume = paid.reduce((sum, order) => sum + Number(order.total), 0);
  const stats: { label: string; value: string; tab: Tab; focus?: "admins" | "hidden" | null }[] = [
    { label: "Accounts", value: String(accounts?.length ?? 0), tab: "accounts" },
    { label: "Admins", value: String(accounts?.filter((item) => item.admin).length ?? 0), tab: "accounts", focus: "admins" },
    { label: "Listings", value: String(products?.filter((item) => item.active).length ?? 0), tab: "listings" },
    { label: "Hidden", value: String(products?.filter((item) => !item.active).length ?? 0), tab: "listings", focus: "hidden" },
    { label: "Orders", value: String(orders?.length ?? 0), tab: "orders" },
    { label: "Disputes", value: String(disputes), tab: "disputes" },
    { label: "Support", value: String(support.length), tab: "support" },
    { label: "Reviews", value: String(reviews?.length ?? 0), tab: "reviews" },
    { label: "Reports", value: String(reports), tab: "reports" },
    { label: "Volume", value: `${formatUsdc(volume)} ${USDC_CODE}`, tab: "orders" },
  ];

  return (
    <div className="stack">
      <div className="admin-stats">
        {stats.map((stat) => (
          <button key={stat.label} type="button" className="admin-stat" onClick={() => onOpen(stat.tab, stat.focus ?? null)}>
            <b>{stat.value}</b>
            <span>{stat.label}</span>
          </button>
        ))}
      </div>
      <section className="stack">
        <div className="section-head">
          <h3 className="section-title" style={{ margin: 0 }}>
            Support
          </h3>
          {support.length > 0 && (
            <button type="button" className="btn btn-sm btn-outline" onClick={() => onOpen("support")}>
              Open all
            </button>
          )}
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Messages about cash outs. These are not disputes.
        </p>
        {support.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No support messages yet.
          </p>
        ) : (
          support.slice(0, 5).map((item) => <SupportNote key={item.id} item={item} onDone={onDone} />)
        )}
      </section>
      <article className="panel">
        <h3>System</h3>
        <div className="muted" style={{ fontSize: 13 }}>
          Network: {NETWORK_NAME}. Payments: {USDC_CODE}. Escrow: {ESCROW_ENABLED ? "on" : "off until a contract is set"}.
        </div>
      </article>
    </div>
  );
}

const SUPPORT_REPLIES = [
  "We are looking into this cash out.",
  "This cash out was sent to the number on the transaction.",
  "Please open the cash out and send the number again.",
];

function SupportNote({ item, onDone }: { item: SupportRequest; onDone: () => Promise<void> }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setError(null);
    setBusy(true);
    try {
      await api(`/api/admin/support/${item.id}`, { method: "POST", json: { action: "close" } });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close this support message");
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string) {
    setError(null);
    setBusy(true);
    try {
      await api(`/api/admin/support/${item.id}`, { method: "POST", json: { reply: text } });
      setReply("");
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reply");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel stack">
      <div>
        <b>{item.accountName}</b>
        <div className="muted" style={{ fontSize: 13 }}>
          {new Date(item.createdAt).toLocaleString()}
          {item.amount ? ` · Cashed out ${formatUsdc(item.amount)} USDC` : ""}
          {item.network ? ` · ${item.network}` : ""} {item.phone ?? ""}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          Transaction <span className="mono">{item.payoutId}</span>
          {item.fee ? ` · Fee ${formatUsdc(item.fee)}` : ""}
          {item.net ? ` · Received ${formatUsdc(item.net)}` : ""}
        </div>
      </div>
      <div className="support-thread">
        <div className="support-bubble you">
          <b>{item.accountName}</b>
          <p>{item.message}</p>
          <time>{new Date(item.createdAt).toLocaleString()}</time>
        </div>
        {item.reply && (
          <div className="support-bubble desk">
            <b>Support</b>
            <p>{item.reply}</p>
            <time>{item.repliedAt ? new Date(item.repliedAt).toLocaleString() : ""}</time>
          </div>
        )}
        <span className={`support-pill ${item.status === "closed" ? "closed" : "wait"}`}>
          {item.status === "closed"
            ? `Closed${item.closedAt ? ` · ${new Date(item.closedAt).toLocaleString()}` : ""}`
            : "Open"}
        </span>
      </div>
      {item.status !== "closed" && (
        <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {SUPPORT_REPLIES.map((option) => (
          <button key={option} type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={() => send(option)}>
            {option}
          </button>
        ))}
        <button type="button" className="btn btn-sm" disabled={busy} onClick={close}>
          Close
        </button>
      </div>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          send(reply);
        }}
      >
        <textarea
          className="textarea"
          style={{ minHeight: 70 }}
          maxLength={500}
          placeholder="Or write a reply"
          aria-label="Reply to support"
          value={reply}
          onChange={(event) => setReply(event.target.value)}
        />
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-sm" disabled={busy || reply.trim().length < 2}>
          {busy && <span className="spinner" />} Send reply
        </button>
      </form>
        </>
      )}
      {item.status === "closed" && error && <div className="alert alert-error">{error}</div>}
    </article>
  );
}

function OrderCard({
  order,
  highlight,
  onDone,
  onError,
}: {
  order: Order;
  highlight?: boolean;
  onDone: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [message, setMessage] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [location, setLocation] = useState("");
  const [stage, setStage] = useState<TrackStage>("in-transit");
  const [busy, setBusy] = useState<string | null>(null);
  const open =
    !order.closedAt &&
    order.status !== "cancelled" &&
    order.status !== "refunded" &&
    order.status !== "resolved" &&
    order.status !== "rejected" &&
    order.status !== "refund-approved";
  const canReject = ["pending", "paid", "shipped", "disputed", "completed", "resolved"].includes(order.status);

  async function run(key: string, pathBody: Record<string, unknown>) {
    setBusy(key);
    onError(null);
    try {
      await api(`/api/admin/orders/${order.id}`, { method: "POST", json: pathBody });
      setMessage("");
      setRejectReason("");
      setLocation("");
      await onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update the order");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article
      id={`admin-order-${order.id}`}
      className="panel stack"
      style={highlight ? { borderColor: "var(--green)", boxShadow: "0 0 0 3px #d9f7ea" } : undefined}
    >
      <div>
        <h4 style={{ margin: "0 0 6px" }}>
          {order.productName} <span className={`status status-${order.status}`}>{STATUS_LABEL[order.status]}</span>
        </h4>
        <div className="muted" style={{ fontSize: 13 }}>
          {formatUsdc(order.total)} USDC · {order.mode === "escrow" ? "Escrow" : "Direct"} · qty {order.quantity} ·
          Tracking <span className="mono">{order.trackingNumber}</span>
          {order.closedAt ? " · Delivery closed" : ""}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          Buyer <span className="mono">{shortAddress(order.buyer)}</span>
          {" · "}
          Seller <span className="mono">{shortAddress(order.seller)}</span>
          {" · "}
          {new Date(order.createdAt).toLocaleString()}
        </div>
        {order.disputeMessage && <div className="muted" style={{ fontSize: 13 }}>Dispute: {order.disputeMessage}</div>}
        {order.resolutionNote && <div className="muted" style={{ fontSize: 13 }}>Decision: {order.resolutionNote}</div>}
        {order.status === "refund-approved" && (
          <div className="muted" style={{ fontSize: 13 }}>
            Waiting for the seller to return {formatUsdc(order.total)} USDC to the buyer.
          </div>
        )}
      </div>
      {canReject && (
        <div className="stack">
          <h3 style={{ margin: 0 }}>Reject this order</h3>
          <p className="muted" style={{ margin: 0 }}>
            Use this when the order does not look genuine. Stock goes back on the listing.
          </p>
          <textarea
            className="textarea"
            style={{ minHeight: 70 }}
            maxLength={300}
            placeholder="Why this order does not look genuine"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div>
            <button
              className="btn btn-sm btn-danger"
              type="button"
              disabled={!!busy || rejectReason.trim().length < 2}
              onClick={() => run("reject", { action: "reject", message: rejectReason })}
            >
              {busy === "reject" && <span className="spinner" />} Reject order
            </button>
          </div>
        </div>
      )}
      {order.updates.length > 0 && (
        <ol className="track-list">
          {order.updates.map((update) => (
            <li key={update.id}>
              <b>{TRACK_STAGES.find((item) => item.id === update.stage)?.label ?? update.stage}</b>
              {update.location ? ` · ${update.location}` : ""} · {update.by} · {new Date(update.at).toLocaleString()}
              <div>{update.message}</div>
            </li>
          ))}
        </ol>
      )}
      {order.status === "disputed" && (
        <div className="stack">
          <textarea
            className="textarea"
            style={{ minHeight: 70 }}
            maxLength={300}
            placeholder="Why you are approving or denying this refund"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Approving tells the seller to send the USDC back. Denying leaves the payment with the seller.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn btn-sm"
              type="button"
              disabled={!!busy || message.trim().length < 2}
              onClick={() => run("refund", { action: "resolve", outcome: "refund", message })}
            >
              {busy === "refund" && <span className="spinner" />} Approve refund
            </button>
            <button
              className="btn btn-sm btn-outline"
              type="button"
              disabled={!!busy || message.trim().length < 2}
              onClick={() => run("release", { action: "resolve", outcome: "release", message })}
            >
              {busy === "release" && <span className="spinner" />} Deny refund
            </button>
          </div>
        </div>
      )}
      {open && order.status !== "disputed" && (
        <div className="stack">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="input"
              style={{ flex: "1 1 140px" }}
              maxLength={80}
              placeholder="Where it has reached"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <select className="input" value={stage} onChange={(e) => setStage(e.target.value as TrackStage)}>
              {TRACK_CHOICES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="textarea"
            style={{ minHeight: 70 }}
            maxLength={300}
            placeholder="Tracking message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn btn-sm"
              type="button"
              disabled={!!busy || location.trim().length < 2 || message.trim().length < 2}
              onClick={() => run("track", { action: "track", stage, location, message })}
            >
              {busy === "track" && <span className="spinner" />} Save tracking
            </button>
            {order.status === "pending" && (
              <button className="btn btn-sm btn-outline" type="button" disabled={!!busy} onClick={() => run("cancel", { action: "cancel" })}>
                {busy === "cancel" && <span className="spinner" />} Cancel order
              </button>
            )}
            {(order.status === "paid" || order.status === "shipped") && (
              <button className="btn btn-sm btn-outline" type="button" disabled={!!busy} onClick={() => run("close", { action: "close" })}>
                {busy === "close" && <span className="spinner" />} Close delivery
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function ListingRow({
  product,
  onDone,
  onError,
}: {
  product: Product;
  onDone: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [sellerName, setSellerName] = useState(product.sellerName);
  const [price, setPrice] = useState(product.price);
  const [quantity, setQuantity] = useState(String(product.quantity));
  const [category, setCategory] = useState(product.category);

  useEffect(() => {
    setName(product.name);
    setDescription(product.description);
    setSellerName(product.sellerName);
    setPrice(product.price);
    setQuantity(String(product.quantity));
    setCategory(product.category);
  }, [product]);

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    onError(null);
    try {
      await api(`/api/admin/products/${product.id}`, { method: "POST", json: body });
      await onDone();
      setOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update the listing");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel stack">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <Link href={`/products/${product.id}`} className="link-pink">
            <b>{product.name}</b>
          </Link>
          <div className="muted" style={{ fontSize: 13 }}>
            {product.category} · {formatUsdc(product.price)} USDC · stock {product.quantity} · {product.sellerName}
            {product.active ? "" : " · Hidden"}
            {product.demo ? " · Demo" : ""}
          </div>
          <Link href={`/products/${product.id}`} className="listing-photos" aria-label={product.name}>
            {product.images.slice(0, 3).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" />
            ))}
          </Link>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm btn-outline" type="button" onClick={() => setOpen((value) => !value)}>
            {open ? "Close" : "Edit"}
          </button>
          <button className="btn btn-sm btn-outline" disabled={busy} onClick={() => save({ active: !product.active })}>
            {busy && <span className="spinner" />}
            {product.active ? "Hide" : "Restore"}
          </button>
        </div>
      </div>
      {open && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            save({ name, description, sellerName, price, quantity: Number(quantity), category });
          }}
        >
          <input className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          <textarea className="textarea" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
          <input className="input" value={sellerName} maxLength={40} onChange={(e) => setSellerName(e.target.value)} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price" />
            <input className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="Quantity" />
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
              {!CATEGORIES.includes(category as (typeof CATEGORIES)[number]) && <option value={category}>{category}</option>}
            </select>
          </div>
          <button className="btn btn-sm" disabled={busy}>
            {busy && <span className="spinner" />} Save listing
          </button>
        </form>
      )}
    </article>
  );
}

function AccountRow({
  item,
  selfId,
  onDone,
  onError,
}: {
  item: AdminAccount;
  selfId: string;
  onDone: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run(pathBody: Record<string, unknown>, confirmText: string) {
    if (!confirm(confirmText)) return;
    setBusy(true);
    onError(null);
    try {
      await api(`/api/admin/accounts/${item.id}`, { method: "POST", json: pathBody });
      await onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update the account");
    } finally {
      setBusy(false);
    }
  }

  const setAdmin = (admin: boolean) => run({ admin }, admin ? "Make this account an admin?" : "Remove admin access?");
  const ban = () =>
    run(
      { action: "ban" },
      "Ban this account for the reported violation? They will be signed out and their listings will be hidden.",
    );
  const unban = () => run({ action: "unban" }, "Lift this ban and put their listings back on sale?");

  return (
    <article className="panel" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
      <div>
        <b>
          {item.name}
          {item.admin ? " · Admin" : ""}
          {item.banned ? " · Banned" : ""}
          {item.id === selfId ? " · You" : ""}
        </b>
        <div className="muted" style={{ fontSize: 13 }}>{item.email}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {item.walletAddress ? <span className="mono">{shortAddress(item.walletAddress)}</span> : "No wallet linked"}
          {" · "}
          {item.sessionCount} active session{item.sessionCount === 1 ? "" : "s"}
          {item.openReports > 0 ? ` · ${item.openReports} open report${item.openReports === 1 ? "" : "s"}` : ""}
        </div>
        {item.banned && item.banReason && <div className="muted" style={{ fontSize: 13 }}>Ban: {item.banReason}</div>}
      </div>
      {item.id !== selfId && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!item.admin && item.banned && (
            <button className="btn btn-sm" disabled={busy} onClick={unban}>
              {busy && <span className="spinner" />} Unban
            </button>
          )}
          {!item.admin && !item.banned && item.openReports > 0 && (
            <button className="btn btn-sm btn-danger" disabled={busy} onClick={ban}>
              {busy && <span className="spinner" />} Ban
            </button>
          )}
          <button className="btn btn-sm btn-outline" disabled={busy} onClick={() => setAdmin(!item.admin)}>
            {busy && <span className="spinner" />}
            {item.admin ? "Remove admin" : "Make admin"}
          </button>
        </div>
      )}
    </article>
  );
}

function ReportRow({
  report,
  onDone,
  onError,
}: {
  report: Report;
  onDone: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: "ban" | "dismiss") {
    const prompt =
      action === "ban"
        ? "Ban this account for the reported violation? They will be signed out and their listings will be hidden."
        : "Dismiss this report without a ban?";
    if (!confirm(prompt)) return;
    setBusy(action);
    onError(null);
    try {
      await api(`/api/admin/reports/${report.id}`, { method: "POST", json: { action } });
      await onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update the report");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="panel review-row">
      <div>
        <b>
          {report.accountName} · {report.status === "open" ? "Open" : report.status === "banned" ? "Ban applied" : "Dismissed"}
        </b>
        <div className="muted" style={{ fontSize: 13 }}>
          Reported by {report.reporterName} · {new Date(report.createdAt).toLocaleString()}
        </div>
        <div style={{ fontSize: 14, marginTop: 6 }}>{report.reason}</div>
      </div>
      {report.status === "open" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-sm btn-danger" disabled={!!busy} onClick={() => act("ban")}>
            {busy === "ban" && <span className="spinner" />} Ban account
          </button>
          <button className="btn btn-sm btn-outline" disabled={!!busy} onClick={() => act("dismiss")}>
            {busy === "dismiss" && <span className="spinner" />} Dismiss
          </button>
        </div>
      )}
    </article>
  );
}

function ReviewRow({
  review,
  order,
  onOpen,
  onDone,
  onError,
}: {
  review: Review;
  order?: Order;
  onOpen: (orderId: string) => void;
  onDone: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Remove this review from the seller?")) return;
    setBusy(true);
    onError(null);
    try {
      await api(`/api/admin/reviews/${review.id}`, { method: "DELETE" });
      await onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not remove the review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel review-row">
      <button type="button" className="review-open" onClick={() => onOpen(review.orderId)}>
        <b>
          {review.buyerName || "Buyer"} · {review.rating} / 5{order ? ` · ${order.productName}` : ""}
        </b>
        <div className="muted" style={{ fontSize: 13 }}>
          Seller <span className="mono">{shortAddress(review.seller)}</span>
          {" · "}
          {new Date(review.createdAt).toLocaleString()}
          {" · Open order"}
        </div>
        {review.comment && <div style={{ fontSize: 14 }}>{review.comment}</div>}
      </button>
      <button className="btn btn-sm btn-outline" disabled={busy} onClick={remove}>
        {busy && <span className="spinner" />} Remove
      </button>
    </article>
  );
}

function sellerRows(products: Product[], orders: Order[], reviews: Review[]) {
  const map = new Map<string, { address: string; name: string; listings: number; orders: number; reviews: number; rating: number | null }>();
  function row(address: string, name?: string) {
    const current = map.get(address) ?? { address, name: name || `Seller ${shortAddress(address)}`, listings: 0, orders: 0, reviews: 0, rating: null };
    if (name) current.name = name;
    map.set(address, current);
    return current;
  }
  for (const product of products) row(product.sellerAddress, product.sellerName).listings += 1;
  for (const order of orders) row(order.seller).orders += 1;
  for (const review of reviews) row(review.seller).reviews += 1;
  for (const seller of map.values()) {
    const mine = reviews.filter((review) => review.seller === seller.address);
    seller.rating = mine.length ? mine.reduce((sum, review) => sum + review.rating, 0) / mine.length : null;
  }
  return [...map.values()].sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name));
}
