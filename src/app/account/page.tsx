"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatUsdc, shortAddress } from "@/lib/amount";
import { api } from "@/lib/client/api";
import { addUsdcTrustline, getWalletBalances, signAuth, type WalletBalances } from "@/lib/client/stellar";
import { EXPLORER_URL, NETWORK_NAME } from "@/lib/config";
import type { Account, SellerProfile } from "@/lib/types";
import { ProfileSettings } from "./ProfileSettings";

export default function AccountPage() {
  const { account, loading, refresh, signOut } = useAccount();
  const { address, connect, connecting, wrongNetwork, refreshBalances } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trustBusy, setTrustBusy] = useState(false);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [sales, setSales] = useState<SellerProfile | null>(null);
  const [editing, setEditing] = useState(false);

  const embedded = account?.walletAddress ?? null;
  const shown = embedded ?? address;

  useEffect(() => {
    const wallet = account?.walletAddress;
    if (!wallet || account.admin) {
      setSales(null);
      return;
    }
    let cancelled = false;
    api<SellerProfile>(`/api/sellers/${wallet}`)
      .then((next) => {
        if (!cancelled) setSales(next);
      })
      .catch(() => {
        if (!cancelled) setSales(null);
      });
    return () => {
      cancelled = true;
    };
  }, [account?.walletAddress, account?.admin]);

  useEffect(() => {
    if (!shown) {
      setBalances(null);
      return;
    }
    let cancelled = false;
    setLoadingBalance(true);
    getWalletBalances(shown)
      .then((next) => {
        if (!cancelled) setBalances(next);
      })
      .catch(() => {
        if (!cancelled) setBalances(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingBalance(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shown]);

  async function embed(replace = false) {
    setError(null);
    const wallet = !replace && address ? address : await connect();
    if (!wallet) return;
    setBusy(true);
    try {
      const auth = await signAuth(wallet, "link-wallet");
      await api<Account>("/api/auth/wallet", { method: "POST", json: { address: wallet, auth } });
      await refresh();
      await refreshBalances();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not embed the wallet");
    } finally {
      setBusy(false);
    }
  }

  async function openTrustline() {
    if (!address) return;
    setError(null);
    setTrustBusy(true);
    try {
      await addUsdcTrustline(address);
      setBalances(await getWalletBalances(address));
      await refreshBalances();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the USDC trustline");
    } finally {
      setTrustBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: "48px 0" }}>
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="container">
        <div className="empty">
          <h3>Sign in to see your profile</h3>
          <p>Your orders and wallet stay on this profile.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <Link href="/sign-in" className="btn">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const differentWallet = Boolean(embedded && address && address !== embedded);
  const location = [account.address, account.city, account.country].filter(Boolean).join(", ");

  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="crumbs">
            <Link href="/">Home</Link> / Profile
          </div>
          <h1>Profile</h1>
        </div>
      </div>
      <div className="container profile-layout">
        <section className="panel">
          <div className="profile-identity">
            <div className="avatar" style={{ width: 64, height: 64, fontSize: 26 }}>
              {account.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h2>{account.name}</h2>
              <div className="meta-row">
                <span>{account.email}</span>
                <span>· Member since {new Date(account.createdAt).toLocaleDateString()}</span>
              </div>
              {location && <div className="profile-location">{location}</div>}
            </div>
          </div>
          <div className="profile-actions">
            <Link href="/orders" className="btn btn-outline btn-sm">
              My orders
            </Link>
            <button
              className={editing ? "btn btn-sm" : "btn btn-outline btn-sm"}
              onClick={() => setEditing((open) => !open)}
            >
              Edit profile
            </button>
            {embedded && (
              <Link href={`/sellers/${embedded}`} className="btn btn-outline btn-sm">
                Public page
              </Link>
            )}
            {account.admin && (
              <Link href="/admin" className="btn btn-sm">
                Admin
              </Link>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => signOut()}>
              Sign out
            </button>
          </div>
          {editing && <ProfileSettings account={account} onClose={() => setEditing(false)} />}
          {sales && (
            <div className="balance-tile" style={{ marginTop: 18 }}>
              <span>Sales volume</span>
              <strong>{formatUsdc(sales.salesVolume)} USDC</strong>
              <em>
                {sales.salesCount} paid {sales.salesCount === 1 ? "order" : "orders"}
              </em>
            </div>
          )}
        </section>

        {account.admin ? (
          <section className="panel stack">
            <h3 style={{ margin: 0 }}>Operations</h3>
            <p className="muted" style={{ margin: 0 }}>
              This account oversees listings, orders, and disputes. It does not connect a wallet or send payments.
            </p>
            <Link href="/admin" className="btn btn-sm">
              Open admin
            </Link>
          </section>
        ) : (
        <section className="panel stack">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <h3 style={{ margin: 0 }}>Wallet</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {NETWORK_NAME}
            </span>
          </div>

          {shown ? (
            <>
              <div className="wallet-balances">
                <div className="balance-tile">
                  <span>USDC</span>
                  <strong>{loadingBalance || !balances ? "…" : formatUsdc(balances.usdc)}</strong>
                  <em>{balances?.hasTrustline ? "Available" : "No trustline"}</em>
                </div>
                <div className="balance-tile">
                  <span>XLM</span>
                  <strong>{loadingBalance || !balances ? "…" : formatUsdc(balances.xlm)}</strong>
                  <em>{balances?.funded ? "Network reserve" : "Not on network"}</em>
                </div>
              </div>
              <div>
                <div className="label">{embedded ? "Embedded wallet" : "Connected, not on this profile yet"}</div>
                <a className="mono link-pink" href={`${EXPLORER_URL}/account/${shown}`} target="_blank" rel="noreferrer">
                  {shortAddress(shown)}
                </a>
              </div>
              {balances && !balances.funded && (
                <div className="alert alert-warn">
                  This wallet is not on {NETWORK_NAME} yet. It needs a small XLM balance before it can hold USDC.
                </div>
              )}
              {balances?.funded && !balances.hasTrustline && address === shown && (
                <div className="alert alert-warn">
                  Open a USDC trustline so this wallet can hold a balance.
                  <br />
                  <button className="btn btn-sm" onClick={openTrustline} disabled={trustBusy}>
                    {trustBusy && <span className="spinner" />} Add USDC trustline
                  </button>
                </div>
              )}
              {differentWallet && (
                <p className="muted" style={{ margin: 0 }}>
                  Freighter is open as {shortAddress(address!)}. Embed it if this profile should use that wallet.
                </p>
              )}
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Embed a Stellar wallet on this profile to pay and get paid in USDC. The balance is read from the network.
            </p>
          )}

          {wrongNetwork && <div className="alert alert-warn">Switch Freighter to {NETWORK_NAME} before embedding.</div>}
          {error && <div className="alert alert-error">{error}</div>}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!embedded && (
              <button className="btn btn-sm" onClick={() => embed(false)} disabled={busy || connecting}>
                {(busy || connecting) && <span className="spinner" />} Embed wallet
              </button>
            )}
            {embedded && (
              <button className="btn btn-outline btn-sm" onClick={() => embed(true)} disabled={busy || connecting}>
                {(busy || connecting) && <span className="spinner" />} Change wallet
              </button>
            )}
            {differentWallet && (
              <button className="btn btn-sm" onClick={() => embed(false)} disabled={busy || connecting}>
                Embed {shortAddress(address!)}
              </button>
            )}
            {shown && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  setLoadingBalance(true);
                  try {
                    setBalances(await getWalletBalances(shown));
                    if (address === shown) await refreshBalances();
                  } finally {
                    setLoadingBalance(false);
                  }
                }}
                disabled={loadingBalance}
              >
                Refresh balance
              </button>
            )}
          </div>
        </section>
        )}
      </div>
    </>
  );
}
