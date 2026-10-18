"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { useWallet } from "@/components/WalletProvider";
import { isValidPrice } from "@/lib/amount";
import { api } from "@/lib/client/api";
import { addUsdcTrustline, getUsdcStatus, signAuth, type UsdcStatus } from "@/lib/client/stellar";
import { CATEGORIES } from "@/lib/constants";
import { NETWORK_NAME } from "@/lib/config";
import type { Product } from "@/lib/types";

const MAX_IMAGES = 6;

export default function SellPage() {
  const router = useRouter();
  const { address, connect, connecting, wrongNetwork } = useWallet();
  const { account } = useAccount();
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [sellerName, setSellerName] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usdc, setUsdc] = useState<UsdcStatus | null>(null);
  const [busyTrust, setBusyTrust] = useState(false);

  useEffect(() => {
    setUsdc(null);
    if (address) getUsdcStatus(address).then(setUsdc);
  }, [address]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, MAX_IMAGES - images.length)) {
        const form = new FormData();
        form.append("file", file);
        const { url } = await api<{ url: string }>("/api/upload", { method: "POST", body: form });
        setImages((prev) => [...prev, url]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function addTrustline() {
    if (!address) return;
    setBusyTrust(true);
    try {
      await addUsdcTrustline(address);
      setUsdc(await getUsdcStatus(address));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the trustline");
    } finally {
      setBusyTrust(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!address) return;
    if (!isValidPrice(price)) return setError("Enter a price in USDC, for example 25 or 12.50");
    if (images.length < 3) return setError("Add at least 3 photos");

    setSubmitting(true);
    try {
      const auth = await signAuth(address, "list");
      const product = await api<Product>("/api/products", {
        method: "POST",
        json: {
          name,
          description,
          price,
          quantity: Number(quantity),
          category,
          sellerName,
          images,
          sellerAddress: address,
          auth,
        },
      });
      router.push(`/products/${product.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the listing");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="crumbs">
            <Link href="/">Home</Link> / Sell
          </div>
          <h1>Create a listing</h1>
        </div>
      </div>

      <div className="container" style={{ margin: "28px auto 60px" }}>
        {account?.admin ? (
          <div className="empty">
            <h3>Admins oversee listings</h3>
            <p>Sellers connect a wallet and create listings. Review them from the admin desk.</p>
            <Link href="/admin" className="btn">
              Open admin
            </Link>
          </div>
        ) : !account || !address ? (
          <div className="empty">
            <h3>{account ? "Connect your wallet" : address ? "Sign in to sell" : "Sign in and connect a wallet"}</h3>
            <p>
              {account
                ? "Buyers pay USDC directly to your Stellar wallet."
                : "Sign in with your Market Place account, then connect the wallet that should receive payment."}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {!account && (
                <Link href="/sign-in" className="btn">
                  Sign in
                </Link>
              )}
              {!address && (
                <button className={`btn ${account ? "" : "btn-outline"}`} onClick={connect} disabled={connecting}>
                  {connecting && <span className="spinner" />} Connect wallet
                </button>
              )}
            </div>
          </div>
        ) : (
          <form className="form" onSubmit={submit}>
            <div className="alert alert-info">
              Payments will be sent to <span className="mono">{address}</span> ({NETWORK_NAME}).
            </div>

            {wrongNetwork && (
              <div className="alert alert-warn">Your wallet is on the wrong network. Switch it to {NETWORK_NAME}.</div>
            )}
            {usdc && !usdc.funded && (
              <div className="alert alert-warn">
                This wallet is not funded on {NETWORK_NAME} yet. Send it some XLM to activate the account.
              </div>
            )}
            {usdc?.funded && !usdc.hasTrustline && (
              <div className="alert alert-warn">
                To receive USDC your wallet needs a USDC trustline.
                <br />
                <button type="button" className="btn btn-sm" onClick={addTrustline} disabled={busyTrust}>
                  {busyTrust ? "Adding…" : "Add USDC trustline"}
                </button>
              </div>
            )}

            <div className="field">
              <label htmlFor="name">Product name</label>
              <input id="name" className="input" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="field">
              <span className="label">Photos</span>
              <div className="dropzone" onClick={() => fileInput.current?.click()} role="button" tabIndex={0}>
                {uploading ? "Uploading…" : "Add at least 3 photos (PNG, JPEG or WebP, up to 3 MB each)"}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                hidden
                disabled={images.length >= MAX_IMAGES}
                onChange={(e) => uploadFiles(e.target.files)}
              />
              {images.length > 0 && (
                <div className="previews">
                  {images.map((src) => (
                    <div className="preview" key={src}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" />
                      <button type="button" aria-label="Remove photo" onClick={() => setImages((p) => p.filter((s) => s !== src))}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="desc">Description</label>
              <textarea id="desc" className="textarea" required minLength={10} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="row">
              <div className="field">
                <label htmlFor="price">Price (USDC)</label>
                <input id="price" className="input" required inputMode="decimal" placeholder="25.00" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="qty">Quantity</label>
                <input id="qty" className="input" required type="number" min={1} max={100000} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label htmlFor="cat">Category</label>
                <select id="cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="seller">Seller display name</label>
                <input id="seller" className="input" maxLength={40} placeholder="Optional" value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
              </div>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div>
              <button className="btn btn-lg" disabled={submitting || uploading || wrongNetwork || images.length < 3}>
                {submitting && <span className="spinner" />} Publish listing
              </button>
              <p className="muted" style={{ fontSize: 12.5 }}>
                You will be asked to sign a short message so we know the listing comes from your wallet. It costs nothing.
              </p>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
