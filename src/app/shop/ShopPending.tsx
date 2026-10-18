"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

interface PendingState {
  pending: boolean;
  start: (href: string) => void;
}

const PendingContext = createContext<PendingState | null>(null);

export function ShopPending({ current, children }: { current: string; children: React.ReactNode }) {
  const [pending, setPending] = useState(false);
  const run = useRef(0);
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    const id = run.current;
    const timer = window.setTimeout(() => {
      if (run.current === id) setPending(false);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [current]);

  const start = useCallback((href: string) => {
    if (href === currentRef.current) return;
    run.current += 1;
    setPending(true);
  }, []);

  const value = useMemo(() => ({ pending, start }), [pending, start]);
  return <PendingContext.Provider value={value}>{children}</PendingContext.Provider>;
}

export function useShopPending() {
  const ctx = useContext(PendingContext);
  if (!ctx) throw new Error("useShopPending must be used inside ShopPending");
  return ctx;
}

export function ShopResults({ children }: { children: React.ReactNode }) {
  const { pending } = useShopPending();
  if (!pending) return children;
  return (
    <div className="grid grid-3" aria-label="Searching">
      {Array.from({ length: 6 }, (_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton skeleton-media" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

export function ShopLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { start } = useShopPending();
  return (
    <Link href={href} className={className} onClick={() => start(href)}>
      {children}
    </Link>
  );
}
