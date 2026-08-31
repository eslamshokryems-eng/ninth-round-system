import Link from "next/link";
import { CONTACT } from "../data/contact";
import { PlaceholderTag } from "./placeholder-tag";

const NAV_LINKS = [
  { href: "/about", label: "About" },
  { href: "/programs", label: "Programs" },
  { href: "/coaches", label: "Coaches" },
  { href: "/classes", label: "Classes" },
  { href: "/trial", label: "Book a Free Trial" },
  { href: "/contact", label: "Contact" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6 lg:px-8">
        <div>
          <p className="text-sm font-bold tracking-wide text-ink">9TH ROUND EGYPT</p>
          <p className="mt-2 text-sm text-muted">
            No classes. No waiting. Just action. A structured combat-fitness circuit —
            boxing, kickboxing, and functional conditioning in one 30-minute round.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Navigate</p>
          <ul className="mt-3 space-y-2">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm text-muted hover:text-ink">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Contact</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>WhatsApp — placeholder number</li>
            <li>Phone — placeholder number</li>
            <li>Instagram — {CONTACT.instagramHandle ?? "placeholder handle"}</li>
            <li>Facebook — {CONTACT.facebookHandle ?? "placeholder handle"}</li>
          </ul>
          <div className="mt-3">
            <PlaceholderTag label="contact details needed" />
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 px-4 py-6 text-center text-xs text-muted sm:px-6 lg:px-8">
        &copy; {new Date().getFullYear()} 9th Round Egypt. All rights reserved.
      </div>
    </footer>
  );
}
