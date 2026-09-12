"use client";

import { useLanguage } from "../i18n/language-provider";
import { PACKAGES } from "../data/packages";
import { ExternalCta } from "./cta-buttons";
import { CONTACT } from "../data/contact";

export function PackagesTable() {
  const { dict } = useLanguage();

  return (
    <div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-card border border-bone/15 bg-bone/15 text-center">
        <div className="bg-black p-4">
          <p className="font-condensed text-sm font-bold uppercase tracking-wide text-grey">{dict.packages.duration}</p>
        </div>
        <div className="bg-black p-4">
          <p className="font-condensed text-sm font-bold uppercase tracking-wide text-bone">{dict.packages.fitPro}</p>
          <p className="text-xs text-grey">{dict.packages.fitProSub}</p>
        </div>
        <div className="relative bg-red p-4">
          <p className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-pill bg-bone px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
            {dict.packages.mostPopular}
          </p>
          <p className="font-condensed text-sm font-bold uppercase tracking-wide text-bone">{dict.packages.fighter}</p>
          <p className="text-xs text-bone/80">{dict.packages.fighterSub}</p>
        </div>

        {PACKAGES.map((row) => (
          <PackageRow key={row.durationKey} row={row} />
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        <ExternalCta href={CONTACT.whatsappHref} placement="section">{dict.packages.cta}</ExternalCta>
      </div>
    </div>
  );
}

function PackageRow({ row }: { row: (typeof PACKAGES)[number] }) {
  const { dict } = useLanguage();
  const durationLabel = dict.packages[row.durationKey];

  return (
    <>
      <div className="bg-black p-4 text-sm text-bone">{durationLabel}</div>
      <div className="bg-black p-4">
        {row.fitPro === null ? (
          <span className="font-condensed text-lg font-bold text-grey">{dict.packages.tbc}</span>
        ) : (
          <span className="font-condensed text-lg font-bold text-bone">
            {row.fitPro.toLocaleString()} {dict.packages.egp}
          </span>
        )}
      </div>
      <div className="bg-black p-4">
        <span className="font-condensed text-lg font-bold text-bone">
          {row.fighter.toLocaleString()} {dict.packages.egp}
        </span>
      </div>
    </>
  );
}
