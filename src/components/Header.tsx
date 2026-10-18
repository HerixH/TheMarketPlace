"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { NETWORK_NAME } from "@/lib/config";
import { formatUsdc, shortAddress } from "@/lib/amount";
import { useAccount } from "./AccountProvider";
import { useCart } from "./CartProvider";
import { useRouteLoader } from "./RouteLoader";
import { useWallet } from "./WalletProvider";

function SearchBox() {
  const router = useRouter();
  const { begin, target } = useRouteLoader();
  const [q, setQ] = useState("");
  const searching = target?.startsWith("/shop") ?? false;

  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        const term = q.trim();
        if (term) params.set("q", term);
        const href = `/shop${params.size ? `?${params}` : ""}`;
        begin(href);
        router.push(href);
      }}
    >
      <input
        type="search"
        placeholder="Search products"
        aria-label="Search products"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <button type="submit" disabled={searching}>
        {searching && <span className="spinner" />} Search
      </button>
    </form>
  );
}

export function Header() {
  const pathname = usePathname();
  const { address, balances, connect, connecting, disconnect, error, wrongNetwork } = useWallet();
  const { account } = useAccount();
  const { count } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPath, setMenuPath] = useState(pathname);

  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (menuRef.current?.contains(target) || target.closest(".menu-toggle")) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const link = (href: string, label: string) => (
    <Link href={href} className={pathname === href ? "active" : undefined}>
      {label}
    </Link>
  );

  return (
    <header>
      <div className="mainbar">
        <div className="container">
          <Link href="/" className="logo">
            <span className="logo-mark">M</span>
            The Market Place
          </Link>
          <nav className="nav" aria-label="Main">
            {link("/", "Home")}
            {link("/shop", "Shop")}
            {link("/sell", "Sell")}
            {link("/orders", "Orders")}
          </nav>
          <Suspense>
            <SearchBox />
          </Suspense>
          <button
            type="button"
            className={menuOpen ? "menu-toggle is-open" : "menu-toggle"}
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="header-actions"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {address && !account?.admin && <span className="dot" />}
            <span className="menu-bars" aria-hidden />
            {count > 0 && <em className="menu-count">{count}</em>}
          </button>
          <div
            id="header-actions"
            ref={menuRef}
            className={menuOpen ? "header-actions is-open" : "header-actions"}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a, button")) setMenuOpen(false);
            }}
          >
            <Link href="/cart" className={pathname === "/cart" ? "btn btn-sm" : "btn btn-outline btn-sm"}>
              Cart{count > 0 ? ` (${count})` : ""}
            </Link>
            {account?.admin && (
              <Link href="/admin" className={pathname === "/admin" ? "btn btn-sm" : "btn btn-outline btn-sm"}>
                Admin
              </Link>
            )}
            {account ? (
              <Link href="/account" className={pathname === "/account" ? "btn btn-sm" : "btn btn-ghost btn-sm"}>
                Profile
              </Link>
            ) : (
              <Link href="/sign-in" className="btn btn-outline btn-sm">
                Sign in
              </Link>
            )}
            {!account?.admin &&
              (address ? (
                <div className="header-wallet">
                  <Link href="/account" className="btn btn-wallet btn-sm" title={address}>
                    <span className="dot" />
                    {shortAddress(address)}
                    {balances && <span className="wallet-bal">{formatUsdc(balances.usdc)} USDC</span>}
                  </Link>
                  <button className="btn btn-ghost btn-sm" onClick={disconnect}>
                    Disconnect
                  </button>
                </div>
              ) : (
                <button className="btn btn-sm" onClick={connect} disabled={connecting}>
                  {connecting && <span className="spinner" />} Connect wallet
                </button>
              ))}
          </div>
        </div>
      </div>
      {!account?.admin && error && <div className="demo-note">{error}</div>}
      {!account?.admin && wrongNetwork && (
        <div className="demo-note">
          Your wallet is on the wrong network. Switch Freighter to <b>{NETWORK_NAME}</b> to make payments.
        </div>
      )}
    </header>
  );
}
