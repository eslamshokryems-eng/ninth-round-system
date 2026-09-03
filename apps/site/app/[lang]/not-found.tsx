import { Container } from "@/components/primitives";
import { ButtonLink } from "@/components/button";
import { dict } from "@/content/i18n";
import { DEFAULT_LANG, href } from "@/content/i18n/config";

/**
 * A `not-found.tsx` inside a dynamic segment cannot read the segment's
 * param, so this renders in the site's default language. Every real 404
 * still arrives inside a locale tree, keeps that locale's `<html dir>`
 * from the layout above, and offers the two links that matter.
 */
export default function NotFound() {
  const lang = DEFAULT_LANG;
  const t = dict(lang);

  return (
    <Container>
      <div className="flex min-h-[60vh] flex-col items-start justify-center py-24">
        <p className="u-eyebrow">{t.notFound.eyebrow}</p>
        <h1 className="mt-3 text-5xl uppercase tracking-tight sm:text-6xl">{t.notFound.title}</h1>
        <p className="mt-4 max-w-md text-ash">{t.notFound.body}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={href(lang, "/")}>{t.cta.backHome}</ButtonLink>
          <ButtonLink href={href(lang, "/trial")} variant="outline">
            {t.cta.trial}
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}
