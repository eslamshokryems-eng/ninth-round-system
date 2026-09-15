"use client";

import Link from "next/link";
import { useLanguage } from "../../i18n/language-provider";
import { categoryLabel } from "../../data/product-categories";
import type { Product } from "../../data/products";
import { PlaceholderTag } from "../placeholder-tag";
import { ProductImage } from "./product-image";
import { ProductBadgePill } from "./product-badge";
import { PriceTag } from "./price-tag";

export function ProductCard({ product }: { product: Product }) {
  const { dict, locale } = useLanguage();
  const name = product.name[locale];

  return (
    <Link
      href={`/shop/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-card border border-bone/15 transition-colors hover:border-bone/40"
    >
      <div className="relative">
        <ProductImage src={product.images[0]} alt={name} />
        {product.badge ? (
          <div className="absolute left-2 top-2">
            <ProductBadgePill badge={product.badge} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-red">{categoryLabel(dict, product.category)}</p>
        <p className="font-condensed text-base font-bold uppercase text-bone">{name}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <PriceTag price={product.price} currency={product.currency} />
          {!product.available ? (
            <span className="text-xs font-bold uppercase tracking-wide text-grey">{dict.shop.unavailable}</span>
          ) : null}
        </div>
        <PlaceholderTag label="Sample" />
      </div>
    </Link>
  );
}
