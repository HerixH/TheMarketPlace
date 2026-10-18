"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { useCart } from "@/components/CartProvider";
import { ProductImage } from "@/components/ProductCard";
import { useWallet } from "@/components/WalletProvider";
import { formatUsdc, fromStroops, multiplyPrice, toStroops } from "@/lib/amount";
import { api } from "@/lib/client/api";
import { escrowDeposit, payDirect } from "@/lib/client/stellar";
import { ESCROW_ENABLED } from "@/lib/config";
import { isDemoShopper } from "@/lib/demo";
import type { CartLine } from "@/lib/client/cart";
import type { Order, PayMode, Product } from "@/lib/types";

interface Row {
  line: CartLine;
  product: Product | null;
  missing: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function CartView() {
  const router = useRouter();
  const { lines, ready, setQty, remove } = useCart();
  const { account } = useAccount();
  const { address, connect, connecting } = useWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mode, setMode] = useState<PayMode>(ESCROW_ENABLED ? "escrow" : "direct");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (current: CartLine[]) => {
    const next = await Promise.all(
      current.map(async (line): Promise<Row> => {
        try {
          const product = await api<Product>(`/api/products/${line.productId}`);
          return { line, product, missing: false };
        } catch {
          return { line, product: null, missing: true };
        }
      }),
    );
    setRows(next);
  }, []);

  useEffect(() => {
    if (!ready) return;
    load(lines).catch(() => setError("Could not load the cart"));
  }, [ready, lines, load]);

  const demoShopper = isDemoShopper(account);
  const payable = (rows ?? []).filter(
    (row) =>
      row.product &&
      row.product.active &&
      row.product.quantity > 0 &&
      row.line.quantity > 0 &&
      (!row.product.demo || demoShopper),
  );
  const demoCheckout = demoShopper && payable.length > 0 && payable.every((row) => row.product?.demo);
  const total = fromStroops(
    payable.reduce((sum, row) => sum + toStroops(multiplyPrice(row.product!.price, row.line.quantity)), 0n),
  );

  async function checkout() {
    setError(null);
    if (!account) {
      setError("Sign in before you pay.");
      return;
    }
    if (account.admin) return;
    const demoOnly = payable.every((row) => row.product?.demo);
    const buyer = demoOnly ? (address ?? account.walletAddress ?? "") : (address ?? (await connect()));
    if (!demoOnly && !buyer) return;
    setBusy("checkout");
    const paid: string[] = [];
    try {
      for (const row of payable) {
        const product = row.product!;
        if (!product.demo && product.sellerAddress === buyer) continue;
        setBusy(product.name);
        const quantity = Math.min(row.line.quantity, product.quantity);
        if (quantity < 1) continue;
        const order = await api<Order>("/api/orders", {
          method: "POST",
          json: { productId: product.id, quantity, buyer, mode: product.demo ? "direct" : mode },
        });
        if (product.demo) {
          remove(product.id);
          paid.push(order.id);
          continue;
        }
        if (!buyer) continue;
        const txHash =
          mode === "escrow"
            ? await escrowDeposit({
                orderId: order.id,
                buyer,
                seller: order.seller,
                total: order.total,
                releaseAfter: order.releaseAfter!,
              })
            : await payDirect({ buyer, seller: order.seller, total: order.total, orderId: order.id });
        let confirmed = false;
        let lastError: unknown;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            await api(`/api/orders/${order.id}`, { method: "POST", json: { action: "confirm", txHash } });
            confirmed = true;
            break;
          } catch (err) {
            lastError = err;
            await sleep(2000);
          }
        }
        if (!confirmed) {
          throw new Error(
            lastError instanceof Error ? lastError.message : "Payment was sent but not verified yet. Check My orders.",
          );
        }
        remove(product.id);
        paid.push(order.id);
      }
      if (paid.length === 0) {
        setError("Demo listings stay in the cart. They are not for sale.");
        setBusy(null);
        return;
      }
      router.push(`/orders?new=${paid[0]}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBusy(null);
    }
  }

  if (!ready || rows === null) return <div className="skeleton" style={{ height: 180 }} />;

  if (rows.length === 0) {
    return (
      <div className="empty">
        <h3>Your cart is empty</h3>
        <p>Add products from the shop, then pay for them here.</p>
        <Link href="/shop" className="btn">
          Browse the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="stack">
      {rows.map((row) => {
        const product = row.product;
        const stock = product?.quantity ?? 0;
        return (
          <article key={row.line.productId} className="order">
            <div className="order-img">
              {product ? (
                <ProductImage product={product} />
              ) : (
                <div className="placeholder" />
              )}
            </div>
            <div>
              {product ? (
                <h4>
                  <Link href={`/products/${product.id}`}>{product.name}</Link>
                </h4>
              ) : (
                <h4>This listing is no longer available</h4>
              )}
              <div className="sub">
                {product ? (
                  <>
                    {product.sellerName} · {formatUsdc(product.price)} USDC
                    {!product.active ? " · Not for sale" : product.demo ? (demoShopper ? " · Demo purchase" : " · Demo, not for sale") : ""}
                    {product.active && stock <= 0 ? " · Sold out" : ""}
                  </>
                ) : (
                  "Remove it to continue."
                )}
              </div>
              {product && product.active && stock > 0 && (
                <div className="qty" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    aria-label="Decrease"
                    disabled={!!busy || row.line.quantity <= 1}
                    onClick={() => setQty(product.id, row.line.quantity - 1, stock)}
                  >
                    −
                  </button>
                  <span>{row.line.quantity}</span>
                  <button
                    type="button"
                    aria-label="Increase"
                    disabled={!!busy || row.line.quantity >= stock}
                    onClick={() => setQty(product.id, row.line.quantity + 1, stock)}
                  >
                    +
                  </button>
                </div>
              )}
            </div>
            <div className="order-actions">
              <b>{product ? `${formatUsdc(multiplyPrice(product.price, row.line.quantity))} USDC` : ""}</b>
              <button className="btn btn-sm btn-outline" disabled={!!busy} onClick={() => remove(row.line.productId)}>
                Remove
              </button>
            </div>
          </article>
        );
      })}

      <div className="panel stack">
        <div className="mode-options" role="radiogroup" aria-label="Payment method">
          <label className={`mode ${mode === "escrow" ? "selected" : ""}`} style={!ESCROW_ENABLED ? { opacity: 0.55 } : undefined}>
            <input type="radio" name="cart-mode" checked={mode === "escrow"} disabled={!ESCROW_ENABLED || !!busy} onChange={() => setMode("escrow")} />
            <div>
              <b>Escrow</b>
              <span>{ESCROW_ENABLED ? "Each item is held until you confirm delivery." : "Not available on this deployment."}</span>
            </div>
          </label>
          <label className={`mode ${mode === "direct" ? "selected" : ""}`}>
            <input type="radio" name="cart-mode" checked={mode === "direct"} disabled={!!busy} onChange={() => setMode("direct")} />
            <div>
              <b>Direct payment</b>
              <span>Each seller is paid separately, straight to their wallet.</span>
            </div>
          </label>
        </div>
        <div className="total-row">
          <span>To pay</span>
          <span className="price" style={{ fontSize: 22 }}>
            {formatUsdc(total)} <small>USDC</small>
          </span>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {!account && (
          <Link href="/sign-in" className="btn">
            Sign in to check out
          </Link>
        )}
        {account?.admin && (
          <Link href="/admin" className="btn">
            Open admin
          </Link>
        )}
        {account && !account.admin && (
          <button className="btn btn-lg" disabled={!!busy || (!demoCheckout && connecting) || payable.length === 0} onClick={checkout}>
            {(busy || (!demoCheckout && connecting)) && <span className="spinner" />}
            {busy && busy !== "checkout"
              ? demoCheckout
                ? "Placing order…"
                : `Paying ${busy}…`
              : payable.length === 0
                ? rows.some((row) => row.product?.demo)
                  ? "Demo listings are not for sale"
                  : "Nothing to pay"
                : demoCheckout
                  ? "Buy demo order"
                  : "Check out"}
          </button>
        )}
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {account?.admin
            ? "Checkout is for shoppers. This account reviews orders from the admin desk."
            : demoCheckout
              ? "This demo account can buy demo listings. No USDC is sent."
              : "Items from different sellers are paid one at a time. Demo listings stay in the cart."}
        </p>
      </div>
    </div>
  );
}
