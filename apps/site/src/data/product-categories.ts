import type { Dictionary } from "../i18n/dictionary";

export type ProductCategorySlug = "boxing" | "apparel" | "accessories" | "training-gear" | "merch";

export interface ProductCategoryMeta {
  slug: ProductCategorySlug;
  /** Key into dict.shop.categories for the localized label. */
  labelKey: "boxing" | "apparel" | "accessories" | "trainingGear" | "merch";
}

export const PRODUCT_CATEGORIES: ProductCategoryMeta[] = [
  { slug: "boxing", labelKey: "boxing" },
  { slug: "apparel", labelKey: "apparel" },
  { slug: "accessories", labelKey: "accessories" },
  { slug: "training-gear", labelKey: "trainingGear" },
  { slug: "merch", labelKey: "merch" },
];

export function categoryLabel(dict: Dictionary, slug: ProductCategorySlug): string {
  const meta = PRODUCT_CATEGORIES.find((c) => c.slug === slug);
  return meta ? dict.shop.categories[meta.labelKey] : slug;
}
