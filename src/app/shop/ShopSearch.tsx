"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useShopPending } from "./ShopPending";

export function ShopSearch({ q, sort, category }: { q?: string; sort?: string; category?: string }) {
  const router = useRouter();
  const { pending, start } = useShopPending();
  const [value, setValue] = useState(q ?? "");

  useEffect(() => {
    setValue(q ?? "");
  }, [q]);

  return (
    <form
      className="toolbar-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        const term = value.trim();
        if (term) params.set("q", term);
        else if (category) params.set("category", category);
        if (sort && sort !== "newest") params.set("sort", sort);
        const href = `/shop${params.size ? `?${params}` : ""}`;
        start(href);
        router.push(href);
      }}
    >
      <input
        type="search"
        placeholder="Search products"
        aria-label="Search products in the shop"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" disabled={pending}>
        {pending && <span className="spinner" />} Search
      </button>
    </form>
  );
}
