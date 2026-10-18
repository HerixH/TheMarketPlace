import Link from "next/link";
import type { Review } from "@/lib/types";
import { Stars } from "./ProductCard";

export function PublicReviews({ reviews, showProduct = false }: { reviews: Review[]; showProduct?: boolean }) {
  if (reviews.length === 0) {
    return <p className="muted">No public reviews yet.</p>;
  }
  return (
    <div className="stack">
      {reviews.map((review) => {
        const body = (
          <>
            <b>{review.buyerName || "Buyer"}</b>
            <div className="meta-row">
              <Stars value={review.rating} />
              <span>
                {review.rating} / 5
                {showProduct && review.productName ? ` · ${review.productName}` : ""} ·{" "}
                {new Date(review.createdAt).toLocaleDateString()}
              </span>
            </div>
            {review.comment ? <p style={{ margin: "8px 0 0" }}>{review.comment}</p> : null}
          </>
        );
        if (!review.productId) {
          return (
            <article key={review.id} className="panel">
              {body}
            </article>
          );
        }
        return (
          <Link key={review.id} href={`/products/${review.productId}`} className="panel review-public">
            {body}
          </Link>
        );
      })}
    </div>
  );
}
