"use client";

import { useState } from "react";
import { useLanguage } from "../../i18n/language-provider";
import { useCart } from "../../lib/cart";
import { trackBeginCheckout, trackRemoveFromCart, trackWhatsAppOrderClick } from "../../lib/analytics";
import { buildWhatsAppOrderMessage, cartLinesToOrderLines, whatsAppOrderUrl } from "../../lib/whatsapp-order";
import { PriceTag } from "./price-tag";

/** Floating sticky cart access + slide-over drawer — mounted once per shop page via app/shop/layout.tsx's CartProvider subtree. */
export function CartWidget() {
  const { dict } = useLanguage();
  const cart = useCart();
  const [isOpen, setIsOpen] = useState(false);

  function handleCheckout() {
    trackBeginCheckout(cart.totalQuantity);
    trackWhatsAppOrderClick(cart.totalQuantity, "cart");
    const message = buildWhatsAppOrderMessage(
      cartLinesToOrderLines(cart.lines),
      dict.shop.whatsappMessage,
      dict.shop.priceComingSoon,
      cart.subtotal,
      cart.hasUnknownPriceLines,
    );
    window.open(whatsAppOrderUrl(message), "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={dict.shop.cart.heading}
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-red text-bone shadow-lg sm:bottom-6"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
          <path
            d="M4 5h2l2.4 11.5A2 2 0 0 0 10.35 18H18a2 2 0 0 0 1.95-1.55L21.5 9H6.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="10" cy="21" r="1.3" fill="currentColor" />
          <circle cx="18" cy="21" r="1.3" fill="currentColor" />
        </svg>
        {cart.totalQuantity > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-bone text-[11px] font-bold text-black">
            {cart.totalQuantity}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={() => setIsOpen(false)}>
          <div className="flex h-full w-full max-w-sm flex-col bg-black p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl uppercase text-bone">{dict.shop.cart.heading}</h2>
                {cart.totalQuantity > 0 ? (
                  <p className="text-xs text-grey">
                    {cart.totalQuantity} {dict.shop.cart.items}
                  </p>
                ) : null}
              </div>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Close" className="text-grey hover:text-bone">
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="mt-6 flex-1 space-y-4 overflow-y-auto">
              {cart.lines.length === 0 ? (
                <p className="text-sm text-grey">{dict.shop.cart.empty}</p>
              ) : (
                cart.lines.map((line) => (
                  <div key={line.key} className="rounded-card border border-bone/15 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-condensed text-sm font-bold uppercase text-bone">{line.name}</p>
                        {line.variant.size || line.variant.color ? (
                          <p className="text-xs text-grey">
                            {[line.variant.size, line.variant.color].filter(Boolean).join(" / ")}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          trackRemoveFromCart(line.slug, line.category);
                          cart.removeItem(line.key);
                        }}
                        className="text-xs text-grey hover:text-red"
                      >
                        {dict.shop.cart.remove}
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => cart.decrement(line.key)}
                          aria-label="Decrease quantity"
                          className="h-7 w-7 rounded-lg border border-bone/20 text-bone"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm text-bone">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => cart.increment(line.key)}
                          aria-label="Increase quantity"
                          className="h-7 w-7 rounded-lg border border-bone/20 text-bone"
                        >
                          +
                        </button>
                      </div>
                      <PriceTag price={line.price === null ? null : line.price * line.quantity} currency={line.currency} />
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.lines.length > 0 ? (
              <div className="mt-6 space-y-4 border-t border-bone/10 pt-4">
                {cart.hasUnknownPriceLines ? <p className="text-xs text-grey">{dict.shop.cart.priceUnknownNotice}</p> : null}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold uppercase text-grey">{dict.shop.cart.subtotal}</span>
                  <PriceTag price={cart.subtotal} currency="EGP" />
                </div>
                <button
                  type="button"
                  onClick={handleCheckout}
                  className="w-full rounded-pill bg-red px-6 py-3 text-sm font-bold uppercase tracking-wide text-bone hover:bg-red/90"
                >
                  {dict.shop.cart.checkoutWhatsapp}
                </button>
                <button
                  type="button"
                  onClick={() => cart.clear()}
                  className="w-full rounded-pill border border-bone/20 px-6 py-3 text-sm font-bold uppercase tracking-wide text-bone hover:border-bone/40"
                >
                  {dict.shop.cart.clear}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
