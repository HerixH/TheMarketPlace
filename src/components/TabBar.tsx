"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./CartProvider";
import { BoxIcon, CartIcon, HomeIcon, PlusIcon, ShopIcon } from "./Icons";

const TABS = [
  { href: "/", label: "Home", icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/shop", label: "Shop", icon: ShopIcon, match: (p: string) => p.startsWith("/shop") || p.startsWith("/products") },
  { href: "/cart", label: "Cart", icon: CartIcon, match: (p: string) => p.startsWith("/cart") },
  { href: "/sell", label: "Sell", icon: PlusIcon, match: (p: string) => p.startsWith("/sell") },
  { href: "/orders", label: "Orders", icon: BoxIcon, match: (p: string) => p.startsWith("/orders") },
];

export function TabBar() {
  const pathname = usePathname();
  const { count } = useCart();
  return (
    <nav className="tabbar" aria-label="Mobile">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.match(pathname);
        return (
          <Link key={tab.href} href={tab.href} className={active ? "active" : undefined}>
            <Icon />
            <span>{tab.label}</span>
            {tab.href === "/cart" && count > 0 && <em className="tab-count">{count}</em>}
          </Link>
        );
      })}
    </nav>
  );
}
