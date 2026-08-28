import { Container } from "@/components/primitives";
import { ButtonLink } from "@/components/button";

export default function NotFound() {
  return (
    <Container>
      <div className="flex min-h-[60vh] flex-col items-start justify-center py-24">
        <p className="u-eyebrow">Error 404</p>
        <h1 className="mt-3 text-5xl uppercase tracking-tight sm:text-6xl">Page not found</h1>
        <p className="mt-4 max-w-md text-ash">That page doesn&apos;t exist. Head back and start with a trial.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/">Back to home</ButtonLink>
          <ButtonLink href="/trial" variant="outline">
            Book a trial
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}
