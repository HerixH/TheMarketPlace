"use client";

import { useRouter } from "next/navigation";
import { SORT_OPTIONS } from "@/lib/constants";
import { useShopPending } from "./ShopPending";

export function SortSelect({ value, q, category }: { value: string; q?: string; category?: string }) {
  const router = useRouter();
  const { start } = useShopPending();
  return (
    <select
      id="sort"
      className="select"
      value={value}
      onChange={(e) => {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (category) params.set("category", category);
        if (e.target.value !== "newest") params.set("sort", e.target.value);
        const href = `/shop${params.size ? `?${params}` : ""}`;
        start(href);
        router.push(href);
      }}
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
