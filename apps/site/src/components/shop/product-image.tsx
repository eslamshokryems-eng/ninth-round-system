"use client";

import Image from "next/image";
import { useLanguage } from "../../i18n/language-provider";

/** Real product photo when one exists; otherwise an elegant "coming soon" placeholder — never a generated/fake photo. */
export function ProductImage({ src, alt, className = "" }: { src: string | undefined; alt: string; className?: string }) {
  const { dict } = useLanguage();

  if (!src) {
    return (
      <div className={`flex aspect-square items-center justify-center border border-bone/15 bg-bone/5 ${className}`}>
        <span className="px-4 text-center font-condensed text-xs font-bold uppercase tracking-widest text-grey">
          {dict.shop.imageComingSoon}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative aspect-square overflow-hidden border border-bone/15 ${className}`}>
      <Image src={src} alt={alt} fill className="object-cover" />
    </div>
  );
}
