import Link from "next/link";
import { notFound } from "next/navigation";
import { Pager } from "@/components/Pager";
import { ProductCard, Stars } from "@/components/ProductCard";
import { PublicReviews } from "@/components/PublicReviews";
import { ReportAccount } from "@/components/ReportAccount";
import { formatUsdc, shortAddress } from "@/lib/amount";
import { EXPLORER_URL } from "@/lib/config";
import { PAGE_SIZE } from "@/lib/constants";
import { listProducts } from "@/lib/server/products";
import { getSellerProfile } from "@/lib/server/sellers";
import { isValidAddress } from "@/lib/server/stellar";

export const dynamic = "force-dynamic";

export default async function SellerPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { address } = await params;
  if (!isValidAddress(address)) notFound();
  const page = Math.max(1, Number((await searchParams).page) || 1);

  const [profile, products] = await Promise.all([
    getSellerProfile(address),
    listProducts({ seller: address, page, limit: PAGE_SIZE, includeInactive: true, includeSoldOut: true }),
  ]);

  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="crumbs">
            <Link href="/">Home</Link> / Seller
          </div>
          <div className="seller-card" style={{ gap: 18 }}>
            <div className="avatar" style={{ width: 68, height: 68, fontSize: 28 }}>
              {profile.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h1>{profile.name}</h1>
              <div className="meta-row">
                {profile.reviewCount > 0 ? (
                  <Link href="#reviews" className="review-jump">
                    <Stars value={profile.averageRating} size={18} />
                    <b style={{ color: "var(--ink)" }}>
                      {profile.averageRating?.toFixed(1)} · {profile.reviewCount} review{profile.reviewCount === 1 ? "" : "s"}
                    </b>
                  </Link>
                ) : (
                  <Stars value={profile.averageRating} size={18} />
                )}
                <span>· {profile.completedOrders} completed sales</span>
                <span>· {formatUsdc(profile.salesVolume)} USDC in sales</span>
                {profile.memberSince && <span>· Member since {new Date(profile.memberSince).toLocaleDateString()}</span>}
              </div>
              <a className="mono link-pink" href={`${EXPLORER_URL}/account/${address}`} target="_blank" rel="noreferrer">
                {shortAddress(address)}
              </a>
              {profile.banned && <p className="muted">This account is banned for a marketplace violation.</p>}
              {profile.accountId && !profile.banned && (
                <div style={{ marginTop: 12 }}>
                  <ReportAccount accountId={profile.accountId} label="Report this account" />
                </div>
              )}
            </div>
          </div>
          <div className="wallet-balances" style={{ marginTop: 18, maxWidth: 420 }}>
            <div className="balance-tile">
              <span>Sales volume</span>
              <strong>{formatUsdc(profile.salesVolume)}</strong>
              <em>USDC from {profile.salesCount} paid {profile.salesCount === 1 ? "order" : "orders"}</em>
            </div>
            <div className="balance-tile">
              <span>Completed</span>
              <strong>{profile.completedOrders}</strong>
              <em>{profile.completedOrders === 1 ? "Delivery closed" : "Deliveries closed"}</em>
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <section className="section" id="products">
          <div className="section-head">
            <h2 className="section-title">Products ({products.total})</h2>
          </div>
          {products.items.length ? (
            <div className="grid">
              {products.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>{products.total ? "No products on this page" : "No listings yet"}</h3>
            </div>
          )}
          <Pager
            page={page}
            total={products.total}
            pageSize={PAGE_SIZE}
            href={(n) => `/sellers/${address}${n > 1 ? `?page=${n}` : ""}#products`}
          />
        </section>

        <section className="section" id="reviews">
          <div className="section-head">
            <h2 className="section-title">Reviews ({profile.reviewCount})</h2>
          </div>
          <PublicReviews reviews={profile.reviews} showProduct />
        </section>
      </div>
    </>
  );
}
