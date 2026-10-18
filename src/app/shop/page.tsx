import Link from "next/link";
import { Pager } from "@/components/Pager";
import { ProductCard } from "@/components/ProductCard";
import { CATEGORIES, PAGE_SIZE, SORT_OPTIONS } from "@/lib/constants";
import { listProducts } from "@/lib/server/products";
import { ShopLink, ShopPending, ShopResults } from "./ShopPending";
import { ShopSearch } from "./ShopSearch";
import { SortSelect } from "./SortSelect";

export const dynamic = "force-dynamic";

type SP = Promise<{ q?: string; category?: string; sort?: string; page?: string }>;

function href(base: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) params.set(k, v);
  return `/shop${params.size ? `?${params}` : ""}`;
}

export default async function Shop({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const sort = SORT_OPTIONS.some((o) => o.value === sp.sort) ? sp.sort : "newest";
  const page = Math.max(1, Number(sp.page) || 1);
  const query = sp.q?.trim() || undefined;
  // A search looks through every category. Category browsing applies only when there is no search.
  const category = query ? undefined : CATEGORIES.includes(sp.category as never) ? sp.category : undefined;

  const result = await listProducts({ q: query, category, sort, page, limit: PAGE_SIZE, includeInactive: true });

  const base = { q: query, sort: sort === "newest" ? undefined : sort };
  const current = href(
    { q: query, category, sort: sort === "newest" ? undefined : sort, page: page > 1 ? String(page) : undefined },
    {},
  );

  return (
    <>
      <div className="page-head">
        <div className="container">
          <div className="crumbs">
            <Link href="/">Home</Link> / Shop{category ? ` / ${category}` : ""}
          </div>
          <h1>{sp.q ? `Results for “${sp.q}”` : category ?? "All products"}</h1>
        </div>
      </div>

      <ShopPending current={current}>
        <div className="container shop-layout">
          <aside className="sidebar">
            <h4>Categories</h4>
            <ul className="cat-list">
              <li>
                <ShopLink href={href(base, { page: undefined })} className={!category ? "active" : ""}>
                  All
                </ShopLink>
              </li>
              {CATEGORIES.map((c) => (
                <li key={c}>
                  <ShopLink href={href({}, { category: c })} className={category === c ? "active" : ""}>
                    {c}
                  </ShopLink>
                </li>
              ))}
            </ul>
          </aside>

          <section>
            <div className="toolbar">
              <ShopSearch q={query} sort={sort} category={category} />
              <div className="toolbar-right">
                <label htmlFor="sort">Sort by</label>
                <SortSelect value={sort ?? "newest"} q={query} category={category} />
              </div>
            </div>

            <ShopResults>
              {result.items.length ? (
                <div className="grid grid-3">
                  {result.items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <h3>Nothing found</h3>
                  <p>Try a different search or category.</p>
                  <Link href="/shop" className="btn btn-outline">
                    Clear filters
                  </Link>
                </div>
              )}

              <Pager
                page={page}
                total={result.total}
                pageSize={PAGE_SIZE}
                href={(n) => href({ ...base, category }, { page: n > 1 ? String(n) : undefined })}
                as={ShopLink}
              />
            </ShopResults>
          </section>
        </div>
      </ShopPending>
    </>
  );
}
