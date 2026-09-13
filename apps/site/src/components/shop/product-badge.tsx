"use client";

import { useLanguage } from "../../i18n/language-provider";
import type { ProductBadge } from "../../data/products";

export function ProductBadgePill({ badge }: { badge: ProductBadge }) {
  const { dict } = useLanguage();
  const label = dict.shop.badge[badge];

  return (
    <span className="inline-flex items-center rounded-pill bg-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-bone">
      {label}
    </span>
  );
}
