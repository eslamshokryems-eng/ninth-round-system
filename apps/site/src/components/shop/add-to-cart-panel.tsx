"use client";

import { useState } from "react";
import { useLanguage } from "../../i18n/language-provider";
import { useCart, type CartVariant } from "../../lib/cart";
import type { Product } from "../../data/products";
import {
  trackAddToCart,
  trackWhatsAppOrderClick,
} from "../../lib/analytics";
import { buildWhatsAppOrderMessage, whatsAppOrderUrl } from "../../lib/whatsapp-order";

export function AddToCartPanel({ product }: { product: Product }) {
  const { dict, locale } = useLanguage();
  const cart = useCart();
  const sizeGroup = product.variants.find((v) => v.kind === "size");
  const colorGroup = product.variants.find((v) => v.kind === "color");
  const [size, setSize] = useState(sizeGroup?.options[0]);
  const [color, setColor] = useState(colorGroup?.options[0]);
  const [quantity, setQuantity] = useState(1);
  const [wasAdded, setWasAdded] = useState(false);

  // exactOptionalPropertyTypes forbids `{ size: undefined }` on an optional
  // property — only spread each key in when it actually has a value.
  const variant: CartVariant = { ...(size !== undefined ? { size } : {}), ...(color !== undefined ? { color } : {}) };
  const name = product.name[locale];

  function handleAddToCart() {
    cart.addItem(product, quantity, variant, name);
    trackAddToCart(product.slug, product.category, quantity);
    setWasAdded(true);
  }

  function handleWhatsAppOrder() {
    trackWhatsAppOrderClick(quantity, "product");
    const variantLabel = [size, color].filter(Boolean).join(" / ") || null;
    const message = buildWhatsAppOrderMessage(
      [{ name, variantLabel, quantity, price: product.price, currency: product.currency }],
      dict.shop.whatsappMessage,
      dict.shop.priceComingSoon,
      product.price === null ? null : product.price * quantity,
      product.price === null,
    );
    window.open(whatsAppOrderUrl(message), "_blank", "noopener,noreferrer");
  }

  if (!product.available) {
    return <p className="text-sm font-bold uppercase tracking-wide text-grey">{dict.shop.unavailable}</p>;
  }

  return (
    <div className="space-y-5">
      {sizeGroup ? (
        <VariantPicker label={dict.shop.product.size} options={sizeGroup.options} value={size} onChange={setSize} />
      ) : null}
      {colorGroup ? (
        <VariantPicker label={dict.shop.product.color} options={colorGroup.options} value={color} onChange={setColor} />
      ) : null}

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-grey">{dict.shop.product.quantity}</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
            className="h-9 w-9 rounded-lg border border-bone/20 text-bone"
          >
            −
          </button>
          <span className="w-8 text-center text-bone">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            aria-label="Increase quantity"
            className="h-9 w-9 rounded-lg border border-bone/20 text-bone"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={handleAddToCart}
          className="w-full rounded-pill bg-red px-6 py-3 text-sm font-bold uppercase tracking-wide text-bone transition-colors hover:bg-red/90 sm:w-auto"
        >
          {wasAdded ? dict.shop.product.addedToCart : dict.shop.product.addToCart}
        </button>
        <button
          type="button"
          onClick={handleWhatsAppOrder}
          className="w-full rounded-pill border border-bone/30 px-6 py-3 text-sm font-bold uppercase tracking-wide text-bone transition-colors hover:border-bone sm:w-auto"
        >
          {dict.shop.product.whatsappOrder}
        </button>
      </div>
    </div>
  );
}

function VariantPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-grey">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-pill border px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
              value === option ? "border-red bg-red text-bone" : "border-bone/20 text-grey hover:border-bone/40 hover:text-bone"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
