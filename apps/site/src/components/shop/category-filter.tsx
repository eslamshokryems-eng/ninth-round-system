"use client";

import { useLanguage } from "../../i18n/language-provider";
import { PRODUCT_CATEGORIES, type ProductCategorySlug } from "../../data/product-categories";

export function CategoryFilter({
  active,
  onChange,
}: {
  active: ProductCategorySlug | "all";
  onChange: (category: ProductCategorySlug | "all") => void;
}) {
  const { dict } = useLanguage();

  return (
    <div className="flex flex-wrap gap-2">
      <FilterPill label={dict.shop.allCategories} isActive={active === "all"} onClick={() => onChange("all")} />
      {PRODUCT_CATEGORIES.map((category) => (
        <FilterPill
          key={category.slug}
          label={dict.shop.categories[category.labelKey]}
          isActive={active === category.slug}
          onClick={() => onChange(category.slug)}
        />
      ))}
    </div>
  );
}

function FilterPill({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-pill border px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
        isActive ? "border-red bg-red text-bone" : "border-bone/20 text-grey hover:border-bone/40 hover:text-bone"
      }`}
    >
      {label}
    </button>
  );
}
