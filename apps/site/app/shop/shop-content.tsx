"use client";

import { useEffect, useMemo, useState } from "react";
import { Container } from "../../src/components/container";
import { ExternalCta } from "../../src/components/cta-buttons";
import { PlaceholderTag } from "../../src/components/placeholder-tag";
import { CategoryFilter } from "../../src/components/shop/category-filter";
import { ProductCard } from "../../src/components/shop/product-card";
import { ShopEmptyState } from "../../src/components/shop/empty-state";
import { PRODUCTS } from "../../src/data/products";
import { CONTACT } from "../../src/data/contact";
import type { ProductCategorySlug } from "../../src/data/product-categories";
import { useLanguage } from "../../src/i18n/language-provider";
import { trackShopView } from "../../src/lib/analytics";

export function ShopContent() {
  const { dict } = useLanguage();
  const [activeCategory, setActiveCategory] = useState<ProductCategorySlug | "all">("all");

  useEffect(() => {
    trackShopView();
  }, []);

  const featured = useMemo(() => PRODUCTS.filter((p) => p.badge).slice(0, 4), []);
  const newArrivals = useMemo(() => PRODUCTS.filter((p) => p.badge === "new"), []);
  const merch = useMemo(() => PRODUCTS.filter((p) => p.category === "merch"), []);
  const filtered = useMemo(
    () => (activeCategory === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.category === activeCategory)),
    [activeCategory],
  );

  return (
    <>
      <section className="border-b border-bone/10 py-20 text-center">
        <Container>
          <p className="font-condensed text-sm font-bold uppercase tracking-[0.3em] text-red">{dict.shop.hero.kicker}</p>
          <h1 className="mx-auto mt-4 max-w-2xl font-display text-5xl uppercase leading-none tracking-tight text-bone sm:text-6xl">
            {dict.shop.hero.headline}
          </h1>
          <p className="mx-auto mt-5 max-w-xl font-condensed text-lg text-bone/90">{dict.shop.hero.sub}</p>
          <div className="mt-6 flex justify-center">
            <PlaceholderTag label="Sample catalog" />
          </div>
        </Container>
      </section>

      <Container className="py-16">
        <p className="mx-auto max-w-xl text-center text-sm text-grey">{dict.shop.sampleNotice}</p>

        {activeCategory === "all" && featured.length > 0 ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl uppercase text-bone">{dict.shop.featuredHeading}</h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {featured.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          </section>
        ) : null}

        {activeCategory === "all" && newArrivals.length > 0 ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl uppercase text-bone">{dict.shop.newArrivalsHeading}</h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {newArrivals.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          </section>
        ) : null}

        {activeCategory === "all" && merch.length > 0 ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl uppercase text-bone">{dict.shop.merchHeading}</h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {merch.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-12">
          <h2 className="font-display text-2xl uppercase text-bone">{dict.shop.categoriesHeading}</h2>
          <div className="mt-6">
            <CategoryFilter active={activeCategory} onChange={setActiveCategory} />
          </div>

          <div className="mt-8">
            {filtered.length === 0 ? (
              <ShopEmptyState message={dict.shop.empty.noProducts} />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((product) => (
                  <ProductCard key={product.slug} product={product} />
                ))}
              </div>
            )}
            {activeCategory !== "all" && filtered.length > 0 && filtered.length < 3 ? (
              <p className="mt-6 text-center text-xs uppercase tracking-wide text-grey">{dict.shop.categoryComingSoon}</p>
            ) : null}
          </div>
        </section>

        <section className="mt-16 rounded-card border border-bone/15 p-8 text-center">
          <h2 className="font-display text-2xl uppercase text-bone">{dict.shop.product.whatsappOrder}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-grey">{dict.shop.hero.sub}</p>
          <div className="mt-6 flex justify-center">
            <ExternalCta href={CONTACT.whatsappHref} placement="shop_home_cta">
              {dict.shop.product.whatsappOrder}
            </ExternalCta>
          </div>
        </section>
      </Container>
    </>
  );
}
