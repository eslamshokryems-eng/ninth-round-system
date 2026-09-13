"use client";

import { useLanguage } from "../../i18n/language-provider";

export function PriceTag({ price, currency, className = "" }: { price: number | null; currency: string; className?: string }) {
  const { dict } = useLanguage();

  if (price === null) {
    return <span className={`font-condensed text-sm font-bold uppercase tracking-wide text-grey ${className}`}>{dict.shop.priceComingSoon}</span>;
  }

  return (
    <span className={`font-condensed text-lg font-bold text-bone ${className}`}>
      {price.toLocaleString()} {currency}
    </span>
  );
}
