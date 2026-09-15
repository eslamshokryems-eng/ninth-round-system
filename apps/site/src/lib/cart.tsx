"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Product } from "../data/products";

export interface CartVariant {
  size?: string;
  color?: string;
}

export interface CartLine {
  key: string;
  slug: string;
  name: string;
  price: number | null;
  currency: string;
  category: string;
  variant: CartVariant;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  addItem: (product: Product, quantity: number, variant: CartVariant, displayName: string) => void;
  removeItem: (key: string) => void;
  increment: (key: string) => void;
  decrement: (key: string) => void;
  clear: () => void;
  totalQuantity: number;
  /** Sum of known-price lines only; null when the cart is empty. Always pair with hasUnknownPriceLines in UI copy. */
  subtotal: number | null;
  hasUnknownPriceLines: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "9thround-shop-cart";

function lineKey(slug: string, variant: CartVariant): string {
  return `${slug}::${variant.size ?? ""}::${variant.color ?? ""}`;
}

function readStoredLines(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt or unavailable storage (private browsing, quota) — start with an empty cart rather than throwing.
    return [];
  }
}

/** Shop-only cart state, scoped by app/shop/layout.tsx — never mounted on the rest of the public site. No payment data ever lives here, only product/variant/quantity. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setLines(readStoredLines());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Storage unavailable — cart still works for this page view, just doesn't persist.
    }
  }, [lines, isHydrated]);

  const value = useMemo<CartContextValue>(() => {
    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    const knownPriceLines = lines.filter((line) => line.price !== null);
    const subtotal = lines.length === 0 ? null : knownPriceLines.reduce((sum, line) => sum + (line.price ?? 0) * line.quantity, 0);
    const hasUnknownPriceLines = lines.some((line) => line.price === null);

    return {
      lines,
      totalQuantity,
      subtotal,
      hasUnknownPriceLines,
      addItem(product, quantity, variant, displayName) {
        const key = lineKey(product.slug, variant);
        setLines((prev) => {
          const existing = prev.find((line) => line.key === key);
          if (existing) {
            return prev.map((line) => (line.key === key ? { ...line, quantity: line.quantity + quantity } : line));
          }
          return [
            ...prev,
            {
              key,
              slug: product.slug,
              name: displayName,
              price: product.price,
              currency: product.currency,
              category: product.category,
              variant,
              quantity,
            },
          ];
        });
      },
      removeItem(key) {
        setLines((prev) => prev.filter((line) => line.key !== key));
      },
      increment(key) {
        setLines((prev) => prev.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line)));
      },
      decrement(key) {
        setLines((prev) =>
          prev
            .map((line) => (line.key === key ? { ...line, quantity: line.quantity - 1 } : line))
            .filter((line) => line.quantity > 0),
        );
      },
      clear() {
        setLines([]);
      },
    };
  }, [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
