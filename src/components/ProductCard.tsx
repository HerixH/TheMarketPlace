import Image from "next/image";
import Link from "next/link";
import { formatUsdc } from "@/lib/amount";
import type { Product } from "@/lib/types";
import { ArrowRight, ImageIcon, StarIcon } from "./Icons";

/** Only our own uploads are allowed through the image optimizer (see `images.localPatterns`). */
export function isOptimizable(src: string): boolean {
  return /^\/api\/uploads\/[^/?#]+$/.test(src);
}

export function ProductImage({
  product,
  alt,
  sizes = "(max-width: 760px) 50vw, (max-width: 1000px) 33vw, 280px",
}: {
  product: Pick<Product, "images" | "name">;
  alt?: string;
  sizes?: string;
}) {
  const src = product.images[0];
  if (src) {
    return (
      <Image
        src={src}
        alt={alt ?? product.name}
        width={800}
        height={800}
        sizes={sizes}
        unoptimized={!isOptimizable(src)}
      />
    );
  }
  return (
    <div className="placeholder" aria-hidden>
      <ImageIcon />
    </div>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const lowStock = product.quantity > 0 && product.quantity <= 3;
  return (
    <Link href={`/products/${product.id}`} className="card">
      <div className="card-media">
        {(!product.active || lowStock || product.demo) && (
          <div className="badges">
            {!product.active && <span className="badge badge-grey">Not for sale</span>}
            {product.active && lowStock && <span className="badge badge-pink">Only {product.quantity} left</span>}
            {product.demo && <span className="badge badge-grey">Demo</span>}
          </div>
        )}
        <ProductImage product={product} />
      </div>
      <div className="card-body">
        <div style={{ minWidth: 0 }}>
          <h3 className="card-name">{product.name}</h3>
          <div className="card-seller">{product.sellerName}</div>
          {product.reviewCount ? (
            <div className="meta-row" style={{ marginTop: 4 }}>
              <Stars value={product.rating ?? null} />
              <span className="muted">
                {product.rating?.toFixed(1)} ({product.reviewCount})
              </span>
            </div>
          ) : null}
          <div className="price">
            {formatUsdc(product.price)}
            <small>USDC</small>
          </div>
        </div>
        <span className="round-btn" aria-hidden>
          <ArrowRight size={16} />
        </span>
      </div>
    </Link>
  );
}

export function Stars({ value, size }: { value: number | null; size?: number }) {
  if (value === null) return <span className="muted">No reviews yet</span>;
  const full = Math.round(value);
  return (
    <span className="stars" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= full ? "" : "off"}>
          <StarIcon size={size ?? 14} />
        </span>
      ))}
    </span>
  );
}
