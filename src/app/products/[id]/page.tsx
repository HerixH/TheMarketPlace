import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage, Stars } from "@/components/ProductCard";
import { PublicReviews } from "@/components/PublicReviews";
import { formatUsdc, shortAddress } from "@/lib/amount";
import { getProduct, listProducts } from "@/lib/server/products";
import { getSellerProfile } from "@/lib/server/sellers";
import { ProductCard } from "@/components/ProductCard";
import { BuyPanel } from "./BuyPanel";
import { Gallery } from "./Gallery";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const [seller, related] = await Promise.all([
    getSellerProfile(product.sellerAddress),
    listProducts({ category: product.category, limit: 5 }),
  ]);
  const others = related.items.filter((p) => p.id !== product.id).slice(0, 4);
  const productReviews = seller.reviews.filter((review) => review.productId === product.id);
  const productRating = productReviews.length
    ? productReviews.reduce((sum, review) => sum + review.rating, 0) / productReviews.length
    : null;

  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="crumbs">
            <Link href="/">Home</Link> / <Link href="/shop">Shop</Link> /{" "}
            <Link href={`/shop?category=${encodeURIComponent(product.category)}`}>{product.category}</Link>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="detail">
          <Gallery images={product.images} fallback={<ProductImage product={product} />} name={product.name} />

          <div>
            <div className="meta-row">
              <span className="badge badge-grey">{product.category}</span>
              {product.demo && <span className="badge badge-warn">Demo listing</span>}
              {!product.active && <span className="badge badge-grey">Not for sale</span>}
            </div>
            <h1>{product.name}</h1>
            <div className="price-big">
              {formatUsdc(product.price)} <small>USDC</small>
            </div>
            <p style={{ whiteSpace: "pre-wrap", color: "#44445a", margin: "0 0 18px" }}>{product.description}</p>
            <div className="meta-row" style={{ marginBottom: 18 }}>
              {!product.active ? (
                <span className="stock stock-out">Not for sale until the seller relists it</span>
              ) : product.quantity > 0 ? (
                <span className="stock stock-in">{product.quantity} in stock</span>
              ) : (
                <span className="stock stock-out">Sold out</span>
              )}
            </div>

            <div className="panel">
              <h3>Seller</h3>
              <div className="seller-card">
                <div className="avatar">{seller.name.slice(0, 1).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/sellers/${seller.address}`} style={{ fontWeight: 700 }}>
                    {seller.name}
                  </Link>
                  <div className="meta-row">
                    {productReviews.length > 0 ? (
                      <Link href="#reviews" className="review-jump">
                        <Stars value={productRating} />
                        <span>
                          {productRating?.toFixed(1)} ({productReviews.length})
                        </span>
                      </Link>
                    ) : (
                      <Stars value={null} />
                    )}
                    <span>· {seller.completedOrders} sales</span>
                    <span>· {formatUsdc(seller.salesVolume)} USDC</span>
                  </div>
                  <div className="mono muted">{shortAddress(seller.address)}</div>
                </div>
              </div>
            </div>

            <BuyPanel product={product} />
          </div>
        </div>

        <section className="section" id="reviews">
          <div className="section-head">
            <h2 className="section-title">Reviews ({productReviews.length})</h2>
          </div>
          <PublicReviews reviews={productReviews} />
        </section>

        {others.length > 0 && (
          <section className="section">
            <div className="section-head">
              <div>
                <h2 className="section-title">More in {product.category}</h2>
              </div>
            </div>
            <div className="grid">
              {others.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
