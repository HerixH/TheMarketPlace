export const CATEGORIES = [
  "Electronics",
  "Fashion",
  "Beauty",
  "Home & Garden",
  "Collectibles",
  "Books",
  "Sports",
  "Digital Goods",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name (A–Z)" },
] as const;

export const PAGE_SIZE = 12;
