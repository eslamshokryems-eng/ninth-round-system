"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Container } from "../../../src/components/container";
import { PlaceholderTag } from "../../../src/components/placeholder-tag";
import { ProductImage } from "../../../src/components/shop/product-image";
import { PriceTag } from "../../../src/components/shop/price-tag";
import { AddToCartPanel } from "../../../src/components/shop/add-to-cart-panel";
import { categoryLabel } from "../../../src/data/product-categories";
import type { Product } from "../../../src/data/products";
import { useLanguage } from "../../../src/i18n/language-provider";
import { trackProductView } from "../../../src/lib/analytics";

export function ProductDetailContent({ product }: { product: Product }) {
  const { dict, locale } = useLanguage();

  useEffect(() => {
    trackProductView(product.slug, product.category);
  }, [product.slug, product.category]);

  return (
    <Container className="py-16">
      <Link href="/shop" className="text-sm font-bold uppercase tracking-wide text-red hover:text-red/80">
        ← {dict.shop.backToShop}
      </Link>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <ProductImage src={product.images[0]} alt={product.name[locale]} className="rounded-card" />

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-red">{categoryLabel(dict, product.category)}</p>
          <h1 className="mt-2 font-display text-3xl uppercase text-bone sm:text-4xl">{product.name[locale]}</h1>
          <div className="mt-4 flex items-center gap-3">
            <PriceTag price={product.price} currency={product.currency} className="text-2xl" />
            <span
              className={`text-xs font-bold uppercase tracking-wide ${product.available ? "text-grey" : "text-red"}`}
            >
              {product.available ? dict.shop.available : dict.shop.unavailable}
            </span>
          </div>

          <div className="mt-3">
            <PlaceholderTag label="Sample product" />
          </div>

          <p className="mt-6 text-sm font-bold uppercase tracking-wide text-grey">{dict.shop.product.description}</p>
          <p className="mt-2 text-grey">{product.description[locale]}</p>

          <div className="mt-8">
            <AddToCartPanel product={product} />
          </div>
        </div>
      </div>
    </Container>
  );
}
