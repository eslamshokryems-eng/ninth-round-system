import { CONTACT } from "../data/contact";
import type { CartLine } from "./cart";

// Sourced from the site's existing real contact configuration (data/contact.ts),
// never a separately invented number. Digits only, as wa.me requires.
const ORDER_WHATSAPP_DIGITS = CONTACT.callHref.replace(/\D/g, "");

export interface WhatsAppOrderLine {
  name: string;
  variantLabel: string | null;
  quantity: number;
  price: number | null;
  currency: string;
}

interface WhatsAppMessageLabels {
  title: string;
  product: string;
  variant: string;
  quantity: string;
  total: string;
  confirmLine: string;
}

function formatLinePrice(price: number | null, currency: string, priceComingSoon: string): string {
  return price === null ? priceComingSoon : `${(price).toLocaleString()} ${currency}`;
}

/**
 * Builds the WhatsApp order message from cart (or a single product) lines.
 * Only product name/variant/quantity/known-price ever go in — no names,
 * phone numbers, emails, or any internal/member data.
 */
export function buildWhatsAppOrderMessage(
  lines: WhatsAppOrderLine[],
  labels: WhatsAppMessageLabels,
  priceComingSoon: string,
  total: number | null,
  hasUnknownPriceLines: boolean,
): string {
  const blocks = lines.map((line) => {
    const parts = [`${labels.product}\n${line.name}`];
    if (line.variantLabel) parts.push(`${labels.variant}\n${line.variantLabel}`);
    parts.push(`${labels.quantity}\n${line.quantity}`);
    parts.push(formatLinePrice(line.price, line.currency, priceComingSoon));
    return parts.join("\n\n");
  });

  const sections = [labels.title, blocks.join("\n\n---\n\n")];

  if (total !== null) {
    sections.push(
      `${labels.total}\n${total.toLocaleString()} EGP${hasUnknownPriceLines ? " (+ items priced on confirmation)" : ""}`,
    );
  }

  sections.push(labels.confirmLine);

  return sections.join("\n\n");
}

export function whatsAppOrderUrl(message: string): string {
  return `https://wa.me/${ORDER_WHATSAPP_DIGITS}?text=${encodeURIComponent(message)}`;
}

export function cartLinesToOrderLines(lines: CartLine[]): WhatsAppOrderLine[] {
  return lines.map((line) => ({
    name: line.name,
    variantLabel: [line.variant.size, line.variant.color].filter(Boolean).join(" / ") || null,
    quantity: line.quantity,
    price: line.price,
    currency: line.currency,
  }));
}
