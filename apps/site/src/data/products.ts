import type { ProductCategorySlug } from "./product-categories";

export type ProductBadge = "new" | "bestSeller" | "limited";

export interface ProductVariantGroup {
  kind: "size" | "color";
  options: string[];
}

export interface Product {
  slug: string;
  name: { en: string; ar: string };
  category: ProductCategorySlug;
  /** EGP, or null when the price isn't known yet — render as "Price coming soon", never a guess. */
  price: number | null;
  currency: "EGP";
  badge?: ProductBadge;
  available: boolean;
  description: { en: string; ar: string };
  /** Real product photo paths. Empty for every sample product below — renders the "image coming soon" placeholder. */
  images: string[];
  variants: ProductVariantGroup[];
}

/**
 * SAMPLE CATALOG — placeholder products only, so the shop architecture
 * (categories, cart, variants, checkout) can be exercised end to end.
 * None of this is real inventory, and every product card/detail page
 * visibly tags it as a sample via <PlaceholderTag /> (the same pattern
 * already used for TBC pricing in packages.ts). Replace this file with
 * the real catalog when it's ready — the rest of the shop (cart,
 * checkout, SEO, analytics) doesn't need to change.
 *
 * "Focus Mitts" is deliberately left at price: null to exercise the
 * "Price coming soon" state end to end, per the no-invented-prices rule.
 */
export const PRODUCTS: Product[] = [
  {
    slug: "boxing-gloves",
    name: { en: "Boxing Gloves", ar: "جوانتي بوكس" },
    category: "boxing",
    price: 1800,
    currency: "EGP",
    badge: "bestSeller",
    available: true,
    description: {
      en: "Sample product for the 9th Round Shop catalog. Full sizing and material details will be published with the real listing.",
      ar: "منتج تجريبي لكتالوج متجر 9th Round. تفاصيل المقاسات والخامات هتتضاف مع المنتج الحقيقي.",
    },
    images: [],
    variants: [
      { kind: "size", options: ["10oz", "12oz", "14oz", "16oz"] },
      { kind: "color", options: ["Black", "Red"] },
    ],
  },
  {
    slug: "hand-wraps",
    name: { en: "Hand Wraps", ar: "لفافات إيد" },
    category: "boxing",
    price: 250,
    currency: "EGP",
    available: true,
    description: {
      en: "Sample product for the 9th Round Shop catalog. Length and material to be confirmed with the real listing.",
      ar: "منتج تجريبي لكتالوج متجر 9th Round. الطول والخامة هيتأكدوا مع المنتج الحقيقي.",
    },
    images: [],
    variants: [{ kind: "color", options: ["Black", "Red", "White"] }],
  },
  {
    slug: "focus-mitts",
    name: { en: "Focus Mitts", ar: "فوكس ميتس" },
    category: "boxing",
    price: null,
    currency: "EGP",
    available: true,
    description: {
      en: "Sample product for the 9th Round Shop catalog. Price and specifications coming soon.",
      ar: "منتج تجريبي لكتالوج متجر 9th Round. السعر والمواصفات هيتضافوا قريبًا.",
    },
    images: [],
    variants: [],
  },
  {
    slug: "9th-round-t-shirt",
    name: { en: "9th Round T-Shirt", ar: "تيشيرت 9th Round" },
    category: "apparel",
    price: 450,
    currency: "EGP",
    badge: "new",
    available: true,
    description: {
      en: "Sample product for the 9th Round Shop catalog. Fabric and fit details will be published with the real listing.",
      ar: "منتج تجريبي لكتالوج متجر 9th Round. تفاصيل الخامة والمقاس هتتضاف مع المنتج الحقيقي.",
    },
    images: [],
    variants: [
      { kind: "size", options: ["S", "M", "L", "XL"] },
      { kind: "color", options: ["Black", "Bone"] },
    ],
  },
  {
    slug: "9th-round-hoodie",
    name: { en: "9th Round Hoodie", ar: "هودي 9th Round" },
    category: "apparel",
    price: 950,
    currency: "EGP",
    badge: "new",
    available: true,
    description: {
      en: "Sample product for the 9th Round Shop catalog. Fabric and fit details will be published with the real listing.",
      ar: "منتج تجريبي لكتالوج متجر 9th Round. تفاصيل الخامة والمقاس هتتضاف مع المنتج الحقيقي.",
    },
    images: [],
    variants: [{ kind: "size", options: ["S", "M", "L", "XL"] }],
  },
  {
    slug: "gym-duffel-bag",
    name: { en: "Gym Duffel Bag", ar: "شنطة الجيم" },
    category: "accessories",
    price: 650,
    currency: "EGP",
    available: true,
    description: {
      en: "Sample product for the 9th Round Shop catalog. Capacity and material to be confirmed with the real listing.",
      ar: "منتج تجريبي لكتالوج متجر 9th Round. السعة والخامة هيتأكدوا مع المنتج الحقيقي.",
    },
    images: [],
    variants: [],
  },
  {
    slug: "skipping-rope",
    name: { en: "Skipping Rope", ar: "حبل نط" },
    category: "training-gear",
    price: 300,
    currency: "EGP",
    available: true,
    description: {
      en: "Sample product for the 9th Round Shop catalog. Length and adjustability to be confirmed with the real listing.",
      ar: "منتج تجريبي لكتالوج متجر 9th Round. الطول وإمكانية الضبط هيتأكدوا مع المنتج الحقيقي.",
    },
    images: [],
    variants: [],
  },
  {
    slug: "9th-round-water-bottle",
    name: { en: "9th Round Water Bottle", ar: "زجاجة مياه 9th Round" },
    category: "merch",
    price: 200,
    currency: "EGP",
    badge: "limited",
    available: true,
    description: {
      en: "Sample product for the 9th Round Shop catalog. Capacity and material to be confirmed with the real listing.",
      ar: "منتج تجريبي لكتالوج متجر 9th Round. السعة والخامة هيتأكدوا مع المنتج الحقيقي.",
    },
    images: [],
    variants: [],
  },
];
