import Link from "next/link";
import { ArrowRight } from "@/components/Icons";
import { ProductCard } from "@/components/ProductCard";
import { ESCROW_ENABLED } from "@/lib/config";
import { listProducts } from "@/lib/server/products";

export const dynamic = "force-dynamic";

const TILES = [
  { cls: "tile-1", title: "Electronics", sub: "Gadgets and gear" },
  { cls: "tile-2", title: "Fashion", sub: "Wear it, trade it" },
  { cls: "tile-3", title: "Collectibles", sub: "Rare finds" },
];

const STEPS = [
  ["Sign in", "Create an account, then link a Stellar wallet for on chain payments."],
  ["Pay", "Pay in USDC on Stellar, directly or through escrow."],
  ["Seller ships", "Your order is marked paid once the payment is confirmed."],
  ["Confirm delivery", "Confirm receipt to close the order, then review the seller."],
];

export default async function Home() {
  const [featured, value] = await Promise.all([
    listProducts({ limit: 5, sort: "newest" }),
    listProducts({ limit: 5, sort: "price-asc" }),
  ]);

  return (
    <>
      <section className="hero">
        <div className="container">
          <div className="hero-copy">
            <h1>
              Buy and sell with <em>USDC</em> on Stellar.
            </h1>
            <p>
              Trade directly with people around the world. USDC settles on Stellar in seconds, and escrow can hold funds
              until your order arrives.
            </p>
            <div className="hero-actions">
              <Link href="/shop" className="btn btn-lg">
                Start shopping
              </Link>
              <Link href="/sell" className="btn btn-lg btn-outline">
                Sell a product
              </Link>
            </div>
          </div>
          <dl className="hero-stats">
            <div>
              <dt>Settlement</dt>
              <dd>~5 seconds</dd>
            </div>
            <div>
              <dt>Network fee</dt>
              <dd>&lt; $0.01</dd>
            </div>
            <div>
              <dt>Payments</dt>
              <dd>USDC</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="container">
        <div className="tiles">
          {TILES.map((t) => (
            <Link key={t.title} href={`/shop?category=${encodeURIComponent(t.title)}`} className={`tile ${t.cls}`}>
              <h3>{t.title}</h3>
              <small>{t.sub}</small>
              <span className="tile-link">
                Shop now <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>

        <section className="section">
          <div className="section-head">
            <div>
              <h2 className="section-title">Featured products</h2>
              <div className="section-sub">Fresh listings from sellers worldwide</div>
            </div>
            <Link href="/shop" className="link-pink">
              View all
            </Link>
          </div>
          {featured.items.length ? (
            <div className="grid grid-5">
              {featured.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>No products yet</h3>
              <p>Be the first to list something for sale.</p>
              <Link href="/sell" className="btn">
                Create a listing
              </Link>
            </div>
          )}
        </section>

        {value.items.length > 0 && (
          <section className="section">
            <div className="section-head">
              <div>
                <h2 className="section-title">Best value</h2>
                <div className="section-sub">Lowest prices first</div>
              </div>
              <Link href="/shop?sort=price-asc" className="link-pink">
                See more
              </Link>
            </div>
            <div className="grid grid-5">
              {value.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">How it works</h2>
          </div>
          <div className="how">
            {STEPS.map(([title, text], i) => (
              <div className="how-step" key={title}>
                <div className="num">{i + 1}</div>
                <h4>{title}</h4>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="escrow-banner">
            <div>
              <h3>Buy with on-chain escrow</h3>
              <p>
                {ESCROW_ENABLED
                  ? "Your USDC is held by a Soroban smart contract and only reaches the seller when you confirm delivery. If something goes wrong, open a dispute and an arbiter steps in."
                  : "Soroban escrow holds your USDC in a smart contract until you confirm delivery. Escrow is switched off on this deployment until a contract is configured."}
              </p>
            </div>
            <div className="flow">
              <span>Buyer</span>
              <ArrowRight size={14} />
              <span>Escrow</span>
              <ArrowRight size={14} />
              <span>Seller</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
