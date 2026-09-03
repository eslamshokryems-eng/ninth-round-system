import { ButtonLink } from "@/components/button";
import { MembershipInquiryButton } from "@/components/inquiry-button";
import { site } from "@/content/site.config";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";

/**
 * Membership options. Prices are shown ONLY if
 * site.config → memberships.showPrices is true AND a price string is set.
 * Otherwise every plan shows the "contact us" path — no invented numbers.
 */
export function MembershipOptions({ lang }: { lang: Lang }) {
  const { plans, showPrices } = site.memberships;
  const t = dict(lang);

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.name.en} className="flex flex-col rounded-card border border-white/10 bg-ink-850 p-6">
            <h3 className="font-display text-lg uppercase tracking-wide text-bone">{plan.name[lang]}</h3>
            <p className="mt-1 flex-1 text-sm text-ash">{plan.note[lang]}</p>
            <p className="mt-4 font-display text-2xl text-bone">
              {showPrices && plan.price ? (
                plan.price
              ) : (
                <span className="text-base text-ash">{t.memberships.contactForPricing}</span>
              )}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <ButtonLink href={href(lang, "/trial")} size="lg">
          {t.cta.join}
        </ButtonLink>
        <MembershipInquiryButton lang={lang} label={t.cta.askMemberships} />
      </div>
      {!showPrices ? (
        <p className="mt-4 text-sm text-ash">
          {site.memberships.contactCta[lang]}. {t.memberships.trialLine}
        </p>
      ) : null}
    </div>
  );
}
