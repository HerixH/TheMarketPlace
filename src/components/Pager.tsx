import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

type LinkLike = ComponentType<{ href: string; className?: string; children: ReactNode }>;

/** Page numbers with gaps, e.g. 1 … 4 5 6 … 12. */
function pageItems(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const start = Math.max(2, Math.min(page - 1, pages - 4));
  const end = Math.min(pages - 1, Math.max(page + 1, 5));
  const items: (number | "gap")[] = [1];
  if (start > 2) items.push("gap");
  for (let n = start; n <= end; n++) items.push(n);
  if (end < pages - 1) items.push("gap");
  items.push(pages);
  return items;
}

export function Pager({
  page,
  total,
  pageSize,
  href,
  label = "products",
  as: LinkAs = Link,
}: {
  page: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
  label?: string;
  as?: LinkLike;
}) {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);

  return (
    <div className="pager-wrap">
      <p className="pager-summary">
        Showing {from}–{to} of {total} {label} · Page {current} of {pages}
      </p>
      <nav className="pager" aria-label="Pagination">
        {current > 1 ? (
          <LinkAs href={href(current - 1)} className="pager-step">
            ‹ Prev
          </LinkAs>
        ) : (
          <span className="pager-step is-disabled" aria-disabled>
            ‹ Prev
          </span>
        )}
        {pageItems(current, pages).map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} className="pager-gap">
              …
            </span>
          ) : n === current ? (
            <span key={n} className="current" aria-current="page">
              {n}
            </span>
          ) : (
            <LinkAs key={n} href={href(n)}>
              {n}
            </LinkAs>
          ),
        )}
        {current < pages ? (
          <LinkAs href={href(current + 1)} className="pager-step">
            Next ›
          </LinkAs>
        ) : (
          <span className="pager-step is-disabled" aria-disabled>
            Next ›
          </span>
        )}
      </nav>
    </div>
  );
}
