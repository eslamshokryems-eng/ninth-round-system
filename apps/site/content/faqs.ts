/**
 * FAQ content — answers use only verified 9th Round information (the
 * round-based format, "beginners welcome", coach on the floor, free first
 * session as a trial). Anything club-specific that isn't confirmed
 * (prices, exact hours, address) points the visitor to Contact instead of
 * stating a fact.
 *
 * Both languages live side by side so the FAQ JSON-LD emitted on an
 * Arabic page is Arabic — Google reads the answer text, not a translation.
 */

import type { Lang, Localized } from "./i18n/config";

export interface Faq {
  q: Localized;
  a: Localized;
}

export const FAQS: Faq[] = [
  {
    q: { en: "Do I need any boxing or fitness experience?", ar: "محتاج خبرة بوكس أو لياقة؟" },
    a: {
      en: "No. The 9-round circuit is designed to work for complete beginners and experienced athletes at the same time. A coach is on the floor every round to show you the movement and adjust it to your level. Come as you are.",
      ar: "لأ. دايرة التسع راوندات متصممة تشتغل مع المبتدئ تماماً واللاعب المحترف في نفس الوقت. وفي كابتن على الأرض كل راوند يوريك الحركة ويظبطها على مستواك. تعالى زي ما إنت.",
    },
  },
  {
    q: { en: "How long is a session?", ar: "السيشن مدتها قد إيه؟" },
    a: {
      en: "The circuit is nine rounds of about three minutes each — roughly thirty minutes of actual work, plus your own warm-up and cool-down.",
      ar: "الدايرة تسع راوندات كل واحدة حوالي تلات دقايق — يعني حوالي تلاتين دقيقة شغل فعلي، زايد الإحماء والتهدئة بتوعك.",
    },
  },
  {
    q: { en: "Are there fixed class times I have to book?", ar: "في مواعيد كلاسات لازم أحجزها؟" },
    a: {
      en: "The circuit runs without fixed class slots — you start at any open station and complete all nine. Personal training and junior sessions are scheduled separately; the team will confirm a time with you.",
      ar: "الدايرة شغالة من غير مواعيد ثابتة — بتبدأ من أي محطة فاضية وتكمّل التسعة. التدريب الشخصي وسيشنز الناشئين ليهم مواعيد منفصلة؛ الفريق هيأكدلك الميعاد.",
    },
  },
  {
    q: { en: "What happens on my first visit?", ar: "أول زيارة بتحصل فيها إيه؟" },
    a: {
      en: "You book a trial, come in, meet your coach, and train a full circuit with hands-on coaching. Afterwards the team talks through how to keep training and what membership options fit your goal.",
      ar: "بتحجز تجربة، تيجي، تتعرف على الكابتن، وتتمرن دايرة كاملة بإشراف مباشر. وبعدها الفريق بيتكلم معاك عن إزاي تكمّل وإيه الاشتراك اللي يناسب هدفك.",
    },
  },
  {
    q: { en: "What should I bring?", ar: "أجيب معايا إيه؟" },
    a: {
      en: "Training clothes, a towel and water. Hand wraps and gloves are useful once you keep coming, but you do not need your own kit for a first session — ask the coach.",
      ar: "هدوم تمرين وفوطة ومية. الرباط والجوانتي بيبقوا مفيدين لما تستمر، بس مش محتاج عدة خاصة بيك في أول سيشن — اسأل الكابتن.",
    },
  },
  {
    q: { en: "Is it for men and women?", ar: "النادي للرجالة والستات؟" },
    a: {
      en: "Yes. 9th Round is built for men and women training together in the same format.",
      ar: "أيوه. 9th Round متبني عشان الرجالة والستات يتمرنوا بنفس النظام.",
    },
  },
  {
    q: { en: "How do memberships and pricing work?", ar: "الاشتراكات والأسعار شغالة إزاي؟" },
    a: {
      en: "There are monthly, quarterly, six-month and annual options, plus personal training. For current pricing, contact the club directly — the team will walk you through what suits your goal.",
      ar: "في اشتراك شهر وتلاتة وستة وسنة، وكمان تدريب شخصي. للأسعار الحالية كلم النادي مباشرة — الفريق هيشرحلك اللي يناسب هدفك.",
    },
  },
  {
    q: { en: "How do I get started?", ar: "أبدأ إزاي؟" },
    a: {
      en: "Book a trial through the form on this site, or message the club on WhatsApp. The team follows up to confirm a time.",
      ar: "احجز تجربة من الفورم اللي في الموقع، أو ابعت للنادي على واتساب. والفريق هيتابع معاك عشان يأكد الميعاد.",
    },
  },
];

export function faqs(lang: Lang): Array<{ q: string; a: string }> {
  return FAQS.map((f) => ({ q: f.q[lang], a: f.a[lang] }));
}
