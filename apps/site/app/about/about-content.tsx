"use client";

import Image from "next/image";
import { Container } from "../../src/components/container";
import { FounderSection } from "../../src/components/founder-section";
import { useLanguage } from "../../src/i18n/language-provider";

export function AboutContent() {
  const { dict, locale } = useLanguage();

  return (
    <>
      <Container className="py-16">
        <h1 className="font-display text-4xl uppercase text-bone sm:text-5xl">{dict.pages.about.title}</h1>

        <div className="mt-8 grid gap-8 sm:grid-cols-2 sm:items-center">
          <div>
            <p className="text-grey">
              {locale === "ar"
                ? "9th Round مش صالة تمرين عادية. النظام هنا 9 محطات، 30 دقيقة شغل، ومدرب معاك من أول دقيقة لحد الآخر — مش سيركت لوحدك."
                : "9th Round isn't a regular gym. The system here is 9 stations, 30 minutes of work, and a coach with you from the first minute to the last — not a self-guided circuit."}
            </p>
            <p className="mt-4 text-grey">
              {locale === "ar"
                ? "بوكسينج، كيك بوكسينج، MMA، كينبو، قوة، وكارديو — كل ده جوه محطات الـ9 اللي بتتغير كل شهر."
                : "Boxing, kickboxing, MMA, Kenpo, strength, and cardio — all inside the 9 stations, refreshed monthly."}
            </p>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-card">
            <Image src="/gym/gym-floor-angle.jpg" alt="9th Round training floor" fill className="object-cover" />
          </div>
        </div>
      </Container>

      <FounderSection />
    </>
  );
}
