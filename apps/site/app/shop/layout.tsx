import type { ReactNode } from "react";
import { CartProvider } from "../../src/lib/cart";
import { CartWidget } from "../../src/components/shop/cart-widget";

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      {children}
      <CartWidget />
    </CartProvider>
  );
}
