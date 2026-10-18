"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

interface RouteLoaderState {
  target: string | null;
  shownAt: { current: number };
  begin: (href: string) => void;
  clear: () => void;
}

const RouteLoaderContext = createContext<RouteLoaderState | null>(null);

function toPath(href: string) {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

export function RouteLoaderProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<string | null>(null);
  const shownAt = useRef(0);

  const begin = useCallback((href: string) => {
    const next = toPath(href);
    if (!next || next === window.location.pathname + window.location.search) return;
    shownAt.current = Date.now();
    setTarget(next);
  }, []);

  const clear = useCallback(() => setTarget(null), []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      if (anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) return;
      if (anchor.closest(".sidebar, .toolbar, .pager")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      begin(href);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [begin]);

  const value = useMemo(() => ({ target, shownAt, begin, clear }), [target, begin, clear]);
  return <RouteLoaderContext.Provider value={value}>{children}</RouteLoaderContext.Provider>;
}

export function useRouteLoader() {
  const ctx = useContext(RouteLoaderContext);
  if (!ctx) throw new Error("useRouteLoader must be used inside RouteLoaderProvider");
  return ctx;
}

export function RouteLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { target, shownAt, clear } = useRouteLoader();
  const here = pathname + (searchParams.size ? `?${searchParams}` : "");

  useEffect(() => {
    if (!target || target !== here) return;
    const wait = Math.max(0, 280 - (Date.now() - shownAt.current));
    const timer = window.setTimeout(clear, wait);
    return () => window.clearTimeout(timer);
  }, [target, here, shownAt, clear]);

  if (!target) return null;

  return (
    <div className="route-loader" role="status" aria-label="Loading">
      <div className="route-progress" aria-hidden>
        <span />
      </div>
      <div className="container">{skeletonFor(target)}</div>
    </div>
  );
}

function skeletonFor(target: string) {
  const path = target.split("?")[0];
  if (path.startsWith("/products/")) return <DetailSkeleton />;
  if (path === "/orders" || path === "/cart" || path.startsWith("/admin")) return <ListSkeleton />;
  if (path === "/sell" || path === "/sign-in" || path === "/sign-up" || path === "/account") return <FormSkeleton />;
  if (path === "/terms" || path === "/privacy") return <TextSkeleton />;
  return <GridSkeleton />;
}

function GridSkeleton() {
  return (
    <>
      <div className="skeleton skeleton-line title" />
      <div className="grid grid-3">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

function CardSkeleton() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-media" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="detail">
      <div className="skeleton skeleton-media" />
      <div className="skeleton-copy">
        <div className="skeleton skeleton-line title" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-field" />
        <div className="skeleton skeleton-btn" />
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="stack">
      <div className="skeleton skeleton-line title" />
      {Array.from({ length: 3 }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton skeleton-thumb" />
          <div className="skeleton-copy">
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="skeleton-panel">
      <div className="skeleton skeleton-line title" />
      <div className="skeleton skeleton-field" />
      <div className="skeleton skeleton-field" />
      <div className="skeleton skeleton-field tall" />
      <div className="skeleton skeleton-btn" />
    </div>
  );
}

function TextSkeleton() {
  return (
    <div className="skeleton-panel">
      <div className="skeleton skeleton-line title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
    </div>
  );
}
