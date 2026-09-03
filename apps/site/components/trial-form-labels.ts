import { dict } from "@/content/i18n";
import type { Lang } from "@/content/i18n/config";
import type { TrialFormLabels } from "@/components/trial-form";

/**
 * Builds the trial form's label bundle on the server. Kept in one place so
 * the three surfaces that render the form — /trial, each program page, and
 * the ad landing pages — cannot drift apart.
 */
export function trialFormLabels(lang: Lang): TrialFormLabels {
  const t = dict(lang);
  return {
    ...t.form,
    submit: t.cta.trialSubmit,
    sending: t.cta.sending,
    whatsapp: t.cta.whatsappLong,
    contact: t.cta.contact,
  };
}
