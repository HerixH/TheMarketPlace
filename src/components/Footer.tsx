import Link from "next/link";
import { CATEGORIES } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-col" style={{ maxWidth: 320 }}>
          <h5>The Market Place</h5>
          <span>
            A decentralized marketplace where buyers and sellers trade directly, with payments settled in USDC on the
            Stellar network and optional Soroban escrow.
          </span>
        </div>
        <div className="footer-col">
          <h5>Shop</h5>
          {CATEGORIES.slice(0, 5).map((c) => (
            <Link key={c} href={`/shop?category=${encodeURIComponent(c)}`}>
              {c}
            </Link>
          ))}
        </div>
        <div className="footer-col">
          <h5>Legal</h5>
          <Link href="/terms">Terms and conditions</Link>
          <Link href="/privacy">Privacy</Link>
        </div>
        <div className="footer-col">
          <h5>Account</h5>
          <Link href="/sign-in">Sign in</Link>
          <Link href="/sell">Create a listing</Link>
          <Link href="/orders">My orders</Link>
        </div>
      </div>
    </footer>
  );
}
