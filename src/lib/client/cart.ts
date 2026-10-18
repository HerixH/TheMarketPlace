export interface CartLine {
  productId: string;
  quantity: number;
}

const KEY = "marketplace_cart";
const EVENT = "marketplace-cart";

export function readCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const productId = (item as { productId?: unknown }).productId;
      const quantity = (item as { quantity?: unknown }).quantity;
      if (typeof productId !== "string" || !Number.isInteger(quantity) || (quantity as number) < 1) return [];
      return [{ productId, quantity: quantity as number }];
    });
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[]) {
  localStorage.setItem(KEY, JSON.stringify(lines));
  window.dispatchEvent(new Event(EVENT));
}

export function addToCart(productId: string, quantity: number, stock: number) {
  const lines = readCart();
  const next = Math.max(1, Math.min(stock, quantity));
  const found = lines.find((line) => line.productId === productId);
  if (found) found.quantity = Math.min(stock, found.quantity + next);
  else lines.push({ productId, quantity: next });
  writeCart(lines);
}

export function setCartQty(productId: string, quantity: number, stock: number) {
  const lines = readCart()
    .map((line) => (line.productId === productId ? { ...line, quantity: Math.min(stock, quantity) } : line))
    .filter((line) => line.quantity > 0);
  writeCart(lines);
}

export function removeFromCart(productId: string) {
  writeCart(readCart().filter((line) => line.productId !== productId));
}

export function cartCount(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function subscribeCart(onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
