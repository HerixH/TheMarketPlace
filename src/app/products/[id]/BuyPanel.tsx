"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { useCart } from "@/components/CartProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatUsdc, isValidPrice, multiplyPrice } from "@/lib/amount";
import { api } from "@/lib/client/api";
import { CATEGORIES } from "@/lib/constants";
import {
  addUsdcTrustline,
  escrowDeposit,
  getUsdcStatus,
  payDirect,
  signAuth,
  type UsdcStatus,
} from "@/lib/client/stellar";
import { ESCROW_ENABLED, NETWORK_NAME } from "@/lib/config";
import { isDemoShopper } from "@/lib/demo";
import type { Order, PayMode, Product } from "@/lib/types";

type Step = "idle" | "reserving" | "paying" | "verifying";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function BuyPanel({ product }: { product: Product }) {
  const router = useRouter();
  const { address, connect, connecting, wrongNetwork } = useWallet();
  const { account } = useAccount();
  const { add, lines } = useCart();
  const inCart = lines.find((line) => line.productId === product.id)?.quantity ?? 0;
  const [added, setAdded] = useState(false);
  const [qty, setQty] = useState(1);
  const [mode, setMode] = useState<PayMode>(ESCROW_ENABLED ? "escrow" : "direct");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [usdc, setUsdc] = useState<UsdcStatus | null>(null);
  const [busyTrust, setBusyTrust] = useState(false);
  const [delisting, setDelisting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [sellerName, setSellerName] = useState(product.sellerName);
  const [price, setPrice] = useState(product.price);
  const [stock, setStock] = useState(String(product.quantity));
  const [category, setCategory] = useState(product.category);

  const accountOwns = account?.walletAddress === product.sellerAddress;
  const isOwner = accountOwns || address === product.sellerAddress;
  const total = multiplyPrice(product.price, qty);
  const soldOut = product.quantity <= 0;

  const refreshUsdc = useCallback(async () => {
    if (address) setUsdc(await getUsdcStatus(address));
  }, [address]);

  useEffect(() => {
    setUsdc(null);
    refreshUsdc();
  }, [refreshUsdc]);

  const insufficient = usdc?.hasTrustline && Number(usdc.balance) < Number(total);
  const busy = step !== "idle";

  async function buy() {
    setError(null);
    if (!account) {
      setError("Sign in before you pay.");
      return;
    }
    if (account.admin) return;
    if (product.demo) {
      if (!isDemoShopper(account)) {
        setError("Only the demo account can buy a demo listing.");
        return;
      }
      try {
        setStep("reserving");
        const order = await api<Order>("/api/orders", {
          method: "POST",
          json: { productId: product.id, quantity: qty, buyer: address ?? account.walletAddress ?? "", mode: "direct" },
        });
        router.push(`/orders?new=${order.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not place the demo order");
        setStep("idle");
      }
      return;
    }
    let buyer = address;
    if (!buyer) {
      buyer = await connect();
      if (!buyer) return;
    }
    let order: Order | null = null;
    try {
      setStep("reserving");
      order = await api<Order>("/api/orders", {
        method: "POST",
        json: { productId: product.id, quantity: qty, buyer, mode },
      });

      setStep("paying");
      let txHash: string;
      if (mode === "escrow") {
        txHash = await escrowDeposit({
          orderId: order.id,
          buyer,
          seller: order.seller,
          total: order.total,
          releaseAfter: order.releaseAfter!,
        });
      } else {
        txHash = await payDirect({ buyer, seller: order.seller, total: order.total, orderId: order.id });
      }

      setStep("verifying");
      let lastError: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await api<Order>(`/api/orders/${order.id}`, { method: "POST", json: { action: "confirm", txHash } });
          router.push(`/orders?new=${order.id}`);
          return;
        } catch (err) {
          lastError = err;
          await sleep(2000);
        }
      }
      throw new Error(
        `Your payment (${txHash.slice(0, 10)}…) was sent but we could not verify it yet: ${
          lastError instanceof Error ? lastError.message : "unknown error"
        }. Check My orders in a moment.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      setStep("idle");
      router.refresh();
    }
  }

  async function addTrustline() {
    if (!address) return;
    setBusyTrust(true);
    setError(null);
    try {
      await addUsdcTrustline(address);
      await refreshUsdc();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the USDC trustline");
    } finally {
      setBusyTrust(false);
    }
  }

  async function delist() {
    if (!confirm("Take this listing off sale? It stays visible, and you can relist it later.")) return;
    setDelisting(true);
    setError(null);
    try {
      const auth = accountOwns ? undefined : await signAuth(address!, "delist", product.id);
      await api(`/api/products/${product.id}`, { method: "DELETE", json: { address: address ?? product.sellerAddress, auth } });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delist");
    } finally {
      setDelisting(false);
    }
  }

  async function relist() {
    setDelisting(true);
    setError(null);
    try {
      const auth = accountOwns ? undefined : await signAuth(address!, "update-listing", product.id);
      await api<Product>(`/api/products/${product.id}`, { method: "POST", json: { auth, active: true } });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not relist");
    } finally {
      setDelisting(false);
    }
  }

  async function saveListing(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isValidPrice(price)) {
      setError("Enter a price in USDC, for example 25 or 12.50");
      return;
    }
    setSaving(true);
    try {
      const auth = accountOwns ? undefined : await signAuth(address!, "update-listing", product.id);
      await api<Product>(`/api/products/${product.id}`, {
        method: "POST",
        json: { auth, name, description, sellerName, price, quantity: Number(stock), category },
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the listing");
    } finally {
      setSaving(false);
    }
  }

  if (!product.active && !isOwner) {
    return (
      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Not for sale</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          The seller took this listing down. It can be bought again after they relist it.
        </p>
      </div>
    );
  }

  if (isOwner) {
    return (
      <div className="panel" style={{ marginTop: 16 }}>
        <h3>{product.active ? "This is your listing" : "This listing is not for sale"}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          {product.active
            ? "Update the listing here. Price and stock on orders already placed stay as they were. Shipping details are on each order."
            : "Relist it to put it back in the shop. Buyers can purchase it again once it is for sale."}
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/orders" className="btn btn-sm">
            View orders
          </Link>
          <button className="btn btn-sm btn-outline" type="button" onClick={() => setEditing((value) => !value)}>
            {editing ? "Close" : "Edit listing"}
          </button>
          {product.active ? (
            <button className="btn btn-danger btn-sm" onClick={delist} disabled={delisting}>
              {delisting ? "Removing…" : "Delist product"}
            </button>
          ) : (
            <button className="btn btn-sm" onClick={relist} disabled={delisting}>
              {delisting ? "Relisting…" : "Relist product"}
            </button>
          )}
        </div>
        {editing && (
          <form className="stack" style={{ marginTop: 14 }} onSubmit={saveListing}>
            <input className="input" value={name} maxLength={100} aria-label="Product name" onChange={(e) => setName(e.target.value)} required />
            <textarea className="textarea" value={description} maxLength={2000} aria-label="Description" onChange={(e) => setDescription(e.target.value)} required />
            <input className="input" value={sellerName} maxLength={40} aria-label="Seller name" onChange={(e) => setSellerName(e.target.value)} required />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="input" value={price} aria-label="Price" onChange={(e) => setPrice(e.target.value)} required />
              <input className="input" value={stock} aria-label="Quantity" onChange={(e) => setStock(e.target.value)} required />
              <select className="input" value={category} aria-label="Category" onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-sm" disabled={saving}>
              {saving && <span className="spinner" />} Save listing
            </button>
          </form>
        )}
      </div>
    );
  }

  const demoBuy = Boolean(product.demo && isDemoShopper(account));
  const label =
    step === "reserving"
      ? "Reserving…"
      : step === "paying"
        ? "Approve in your wallet…"
        : step === "verifying"
          ? "Verifying on-chain…"
          : !account
            ? "Sign in to buy"
            : account.admin
              ? "Admin accounts oversee orders"
              : product.demo && !demoBuy
                ? "Demo listing"
                : demoBuy
                  ? `Buy demo · ${formatUsdc(total)} USDC`
                  : !address
                    ? "Connect wallet to buy"
                    : `Pay ${formatUsdc(total)} USDC`;

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h3>Checkout</h3>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="label" style={{ margin: 0 }}>
          Quantity
        </span>
        <div className="qty">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1 || busy} aria-label="Decrease">
            −
          </button>
          <span>{qty}</span>
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(product.quantity, q + 1))}
            disabled={qty >= product.quantity || busy}
            aria-label="Increase"
          >
            +
          </button>
        </div>
      </div>

      <div className="mode-options" role="radiogroup" aria-label="Payment method">
        <label className={`mode ${mode === "escrow" ? "selected" : ""}`} style={!ESCROW_ENABLED ? { opacity: 0.55 } : undefined}>
          <input
            type="radio"
            name="mode"
            checked={mode === "escrow"}
            disabled={!ESCROW_ENABLED || busy}
            onChange={() => setMode("escrow")}
          />
          <div>
            <b>Escrow (recommended)</b>
            <span>
              {ESCROW_ENABLED
                ? "USDC is held in a Soroban contract until you confirm delivery. Disputes go to an arbiter."
                : "Not available: no escrow contract is configured on this deployment."}
            </span>
          </div>
        </label>
        <label className={`mode ${mode === "direct" ? "selected" : ""}`}>
          <input type="radio" name="mode" checked={mode === "direct"} disabled={busy} onChange={() => setMode("direct")} />
          <div>
            <b>Direct payment</b>
            <span>USDC goes straight to the seller wallet. Fastest, but there is no buyer protection.</span>
          </div>
        </label>
        <label className="mode mode-later">
          <input type="radio" name="mode" disabled />
          <div>
            <b>Card</b>
            <span>Coming later. Card checkout is not available yet.</span>
          </div>
        </label>
      </div>

      <div className="total-row">
        <span>Total</span>
        <span className="price" style={{ fontSize: 22 }}>
          {formatUsdc(total)} <small>USDC</small>
        </span>
      </div>

      {wrongNetwork && (
        <div className="alert alert-warn" style={{ marginBottom: 10 }}>
          Switch your wallet to {NETWORK_NAME} before paying.
        </div>
      )}

      {address && usdc && !usdc.funded && (
        <div className="alert alert-warn" style={{ marginBottom: 10 }}>
          Your wallet is not funded on {NETWORK_NAME} yet. Send it some XLM first so it can pay network fees.
        </div>
      )}
      {address && usdc?.funded && !usdc.hasTrustline && (
        <div className="alert alert-warn" style={{ marginBottom: 10 }}>
          Your wallet needs a USDC trustline before it can hold USDC.
          <br />
          <button className="btn btn-sm" onClick={addTrustline} disabled={busyTrust}>
            {busyTrust ? "Adding…" : "Add USDC trustline"}
          </button>
        </div>
      )}
      {address && insufficient && (
        <div className="alert alert-warn" style={{ marginBottom: 10 }}>
          Your USDC balance ({formatUsdc(usdc!.balance)}) is lower than this order.
        </div>
      )}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}

      {!account && !product.demo && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <Link href="/sign-in" className="btn btn-sm">
            Sign in
          </Link>
        </div>
      )}

      <button
        className="btn btn-lg btn-block btn-outline"
        type="button"
        onClick={() => {
          add(product.id, qty, product.quantity);
          setAdded(true);
        }}
        disabled={soldOut || busy}
      >
        {soldOut ? "Sold out" : added ? "Added to cart" : "Add to cart"}
      </button>
      {inCart > 0 && (
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
          <Link href="/cart">{inCart} in your cart</Link>
        </p>
      )}

      <button
        className="btn btn-lg btn-block"
        style={{ marginTop: 8 }}
        onClick={buy}
        disabled={
          soldOut ||
          busy ||
          !account ||
          account.admin ||
          (product.demo && !demoBuy) ||
          (!demoBuy && (connecting || wrongNetwork))
        }
      >
        {busy && <span className="spinner" />}
        {soldOut ? "Sold out" : product.demo ? "Demo listing" : label}
      </button>

      {mode === "escrow" && (
        <ul className="steps">
          <li>1. You deposit USDC into the escrow contract</li>
          <li>2. Seller ships your order</li>
          <li>3. You confirm delivery and the contract pays the seller</li>
          <li>4. Problem? Open a dispute before confirming</li>
        </ul>
      )}
    </div>
  );
}
