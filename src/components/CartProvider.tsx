"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { addToCart, cartCount, readCart, removeFromCart, setCartQty, subscribeCart, type CartLine } from "@/lib/client/cart";

interface CartState {
  lines: CartLine[];
  count: number;
  ready: boolean;
  add: (productId: string, quantity: number, stock: number) => void;
  setQty: (productId: string, quantity: number, stock: number) => void;
  remove: (productId: string) => void;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => setLines(readCart()), []);

  useEffect(() => {
    refresh();
    setReady(true);
    return subscribeCart(refresh);
  }, [refresh]);

  const value = useMemo<CartState>(
    () => ({
      lines,
      count: cartCount(lines),
      ready,
      add: (productId, quantity, stock) => {
        addToCart(productId, quantity, stock);
        refresh();
      },
      setQty: (productId, quantity, stock) => {
        setCartQty(productId, quantity, stock);
        refresh();
      },
      remove: (productId) => {
        removeFromCart(productId);
        refresh();
      },
    }),
    [lines, ready, refresh],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
