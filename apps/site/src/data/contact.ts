/**
 * Single source of truth for contact/CTA targets. Every value below is a
 * placeholder — no real WhatsApp number, phone number, address, or social
 * handle has been supplied yet. Update here once, everywhere on the site
 * picks it up.
 */
export const CONTACT = {
  whatsappHref: "#", // TODO: replace with https://wa.me/20XXXXXXXXXX
  callHref: "#", // TODO: replace with tel:+20XXXXXXXXXX
  addressLine: null as string | null, // TODO: full branch address
  mapHref: null as string | null, // TODO: Google Maps link
  instagramHandle: null as string | null,
  facebookHandle: null as string | null,
} as const;
