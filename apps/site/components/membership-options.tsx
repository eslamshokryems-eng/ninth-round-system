import { ButtonLink } from "@/components/button";
import { MembershipInquiryButton } from "@/components/inquiry-button";
import { site } from "@/content/site.config";

/**
 * Membership options. Prices are shown ONLY if
 * site.config → memberships.showPrices is true AND a price string is set.
 * Otherwise every plan shows the "contact us" path — no invented numbers.
 */
export function MembershipOptions({ compact = false }: { compact?: boolean }) {
  const { plans, showPrices } = site.memberships;

  return (
    <div>
      <div className={`grid gap-4 ${compact ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {plans.map((plan) => (
          <div key={plan.name} className="flex flex-col rounded-card border border-white/10 bg-ink-850 p-6">
            <h3 className="font-display text-lg uppercase tracking-wide text-bone">{plan.name}</h3>
            <p className="mt-1 flex-1 text-sm text-ash">{plan.note}</p>
            <p className="mt-4 font-display text-2xl text-bone">
              {showPrices && plan.price ? plan.price : <span className="text-base text-ash">Contact for pricing</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <ButtonLink href="/trial" size="lg">
          Join 9th Round
        </ButtonLink>
        <MembershipInquiryButton />
      </div>
      {!showPrices ? (
        <p className="mt-4 text-sm text-ash">{site.memberships.contactCta}. Your first session can be a trial.</p>
      ) : null}
    </div>
  );
}
