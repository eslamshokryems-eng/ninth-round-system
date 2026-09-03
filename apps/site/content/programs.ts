/**
 * Programs — descriptions are built from 9th Round's own project documents
 * (the 9-round circuit structure, the 4 annual training phases, the
 * monthly assessment metrics). No invented claims, schedules, or results.
 *
 * Every visitor-facing string carries both languages. Slugs stay in
 * English so a program keeps ONE canonical id across both locales:
 * `/ar/programs/boxing` and `/en/programs/boxing` are the same page in two
 * languages, which is exactly what hreflang needs.
 *
 * `trialValue` is what lands on the lead record, so it is deliberately
 * English-only — the internal Sales/CRM app reads it.
 */

import type { Lang, Localized } from "./i18n/config";

export interface Program {
  slug: string;
  name: Localized;
  short: Localized;
  who: Localized;
  /** Section body — plain paragraphs. */
  body: { en: string[]; ar: string[] };
  /** What the training focuses on — short chips. */
  focus: { en: string[]; ar: string[] };
  ctaLabel: Localized;
  /** Pre-fills the trial form's program field, and lands on the lead. */
  trialValue: string;
}

export const PROGRAMS: Program[] = [
  {
    slug: "fitness",
    name: { en: "The 9-Round Circuit", ar: "دايرة التسع راوندات" },
    short: {
      en: "Nine stations, three minutes each, roughly thirty minutes of work. Warm-up, strength, boxing, kickboxing, core and conditioning in one continuous round-based session.",
      ar: "تسع محطات، كل واحدة تلات دقايق، حوالي تلاتين دقيقة شغل. إحماء وقوة وبوكس وكيك بوكسينج وبطن ولياقة في سيشن واحدة متصلة بنظام الراوندات.",
    },
    who: {
      en: "Anyone who wants an efficient, coached, high-energy workout — beginners included. No combat-sports experience needed.",
      ar: "أي حد عايز تمرين سريع ومنظّم وبطاقة عالية مع كابتن — والمبتدئين كمان. مش محتاج أي خبرة في الرياضات القتالية.",
    },
    body: {
      en: [
        "The circuit is built from nine stations. You move to the next one every three minutes, and each station runs three short exercises with brief rests between them. A coach is on the floor the whole time to show the movement and fix your form.",
        "There are no fixed class times. You start at any open station and complete all nine. The final round is always core.",
        "Over a full year the programming moves through four phases — Build, Ignite, Challenge and Master — so the work keeps progressing instead of repeating.",
      ],
      ar: [
        "الدايرة مبنية من تسع محطات. بتنتقل للي بعدها كل تلات دقايق، وكل محطة فيها تلات تمارين قصيرة براحات بسيطة بينهم. والكابتن على الأرض طول الوقت يوريك الحركة ويظبط أداءك.",
        "مفيش مواعيد كلاسات ثابتة. بتبدأ من أي محطة فاضية وتكمّل التسعة. وآخر راوند دايماً بطن.",
        "على مدار سنة كاملة البرنامج بيعدّي على أربع مراحل — Build و Ignite و Challenge و Master — عشان الشغل يفضل ماشي قدام مش مكرر.",
      ],
    },
    focus: {
      en: ["Conditioning", "Strength", "Boxing & kickboxing skills", "Core", "Coordination"],
      ar: ["لياقة", "قوة", "مهارات بوكس وكيك بوكسينج", "بطن", "تناسق حركي"],
    },
    ctaLabel: { en: "Book a trial", ar: "احجز تجربة" },
    trialValue: "The 9-Round Circuit",
  },
  {
    slug: "boxing",
    name: { en: "Boxing", ar: "بوكس" },
    short: {
      en: "Real boxing training inside the circuit and in focused sessions — technique, footwork, bag work and conditioning, coached hands-on.",
      ar: "تدريب بوكس حقيقي جوه الدايرة وفي سيشنز مخصصة — تكنيك وحركة قدم وشغل شكاير ولياقة، بإشراف مباشر من الكابتن.",
    },
    who: {
      en: "Beginners learning to box for the first time, and experienced athletes sharpening technique and engine.",
      ar: "المبتدئين اللي بيتعلموا بوكس لأول مرة، واللاعبين اللي عايزين يحدّوا التكنيك واللياقة.",
    },
    body: {
      en: [
        "Boxing at 9th Round is coached, not just followed. You work stance, guard, the jab and combinations, movement and defence, then apply them on the heavy bag and in conditioning rounds.",
        "You do not need any previous experience. The coach adjusts each round for beginners and works with more advanced members on timing, output and sharpness.",
        "Progress is tracked with simple monthly checkpoints — for example a 30-second jab count — so improvement is visible, not guessed.",
      ],
      ar: [
        "البوكس في 9th Round بيتعلّم مش بيتقلّد. بتشتغل على الوقفة والحماية واللكمة المستقيمة والكومبينيشن والحركة والدفاع، وبعدين بتطبقهم على الشكارة التقيلة وفي راوندات اللياقة.",
        "مش محتاج أي خبرة سابقة. الكابتن بيظبط كل راوند للمبتدئ، وبيشتغل مع المتقدمين على التوقيت والإخراج والحدّة.",
        "التقدّم بيتتابع بقياسات شهرية بسيطة — زي عدد اللكمات في 30 ثانية — عشان التحسن يبقى واضح مش تخمين.",
      ],
    },
    focus: {
      en: ["Technique", "Footwork & movement", "Heavy-bag work", "Conditioning", "Defence"],
      ar: ["تكنيك", "حركة القدم", "شغل الشكارة التقيلة", "لياقة", "دفاع"],
    },
    ctaLabel: { en: "Book a boxing trial", ar: "احجز تجربة بوكس" },
    trialValue: "Boxing",
  },
  {
    slug: "kickboxing",
    name: { en: "Kickboxing", ar: "كيك بوكسينج" },
    short: {
      en: "Striking with hands and legs — kicks, knees, combinations and movement — built on conditioning and coached technique.",
      ar: "ضرب بالإيد والرجل — رفس وركب وكومبينيشن وحركة — مبني على لياقة وتكنيك بإشراف كابتن.",
    },
    who: {
      en: "Members who want striking variety beyond boxing, and anyone after a demanding full-body session.",
      ar: "اللي عايز تنوّع في الضرب أكتر من البوكس، وأي حد عايز سيشن قاسية لكل الجسم.",
    },
    body: {
      en: [
        "Kickboxing adds kicks, knees and longer striking combinations to the boxing base. Sessions build the technique first, then load it with pad and bag work and conditioning.",
        "Coaching is hands-on throughout — the point is clean, controlled technique that holds up when you are tired, not just throwing hard.",
        "It fits straight into the round-based format, so you get the striking work and the workout in the same session.",
      ],
      ar: [
        "الكيك بوكسينج بيضيف الرفس والركب وكومبينيشن أطول فوق أساس البوكس. السيشن بتبني التكنيك الأول، وبعدين بتحمّله بشغل الباد والشكارة واللياقة.",
        "الكابتن معاك خطوة بخطوة — الهدف تكنيك نضيف ومتحكم فيه يفضل ثابت وإنت تعبان، مش مجرد ضرب بقوة.",
        "بيدخل جوه نظام الراوندات على طول، فبتاخد شغل الضرب والتمرين في نفس السيشن.",
      ],
    },
    focus: {
      en: ["Striking technique", "Kicks & knees", "Combinations", "Movement", "Fitness"],
      ar: ["تكنيك الضرب", "رفس وركب", "كومبينيشن", "حركة", "لياقة"],
    },
    ctaLabel: { en: "Book a kickboxing trial", ar: "احجز تجربة كيك بوكسينج" },
    trialValue: "Kickboxing",
  },
  {
    slug: "personal-training",
    name: { en: "Personal Training", ar: "تدريب شخصي" },
    short: {
      en: "One-to-one coaching with goal-based programming and progress tracking, built around you rather than the group circuit.",
      ar: "تدريب واحد لواحد ببرنامج مبني على هدفك ومتابعة للتقدّم، متفصّل عليك إنت مش على الدايرة الجماعية.",
    },
    who: {
      en: "Members who want individual attention — a specific goal, a faster ramp, or focused work on technique.",
      ar: "اللي عايز اهتمام فردي — هدف محدد، أو تقدّم أسرع، أو شغل مركّز على التكنيك.",
    },
    body: {
      en: [
        "Personal training is a private session with a coach who builds the programming around your goal, your starting point and your schedule.",
        "You get individual correction every rep, a plan that adjusts as you progress, and simple tracking so you can see what is changing.",
        "It works on its own or alongside the circuit — many members use PT to build a base or break a plateau, then keep training in the group.",
      ],
      ar: [
        "التدريب الشخصي سيشن خاصة مع كابتن بيبني البرنامج على هدفك ونقطة بدايتك ومواعيدك.",
        "بتاخد تصحيح فردي في كل عدّة، وخطة بتتعدل مع تقدّمك، ومتابعة بسيطة تخليك تشوف إيه اللي بيتغيّر.",
        "بيشتغل لوحده أو جنب الدايرة — ناس كتير بتستخدمه عشان تبني أساس أو تكسر ثبات، وبعدين تكمّل مع الجروب.",
      ],
    },
    focus: {
      en: ["Individual coaching", "Goal-based programming", "Progress tracking", "Technique work"],
      ar: ["تدريب فردي", "برنامج على الهدف", "متابعة التقدّم", "شغل تكنيك"],
    },
    ctaLabel: { en: "Book a PT consultation", ar: "احجز استشارة تدريب شخصي" },
    trialValue: "Personal Training",
  },
  {
    slug: "kids",
    name: { en: "Kids / Junior", ar: "أطفال وناشئين" },
    short: {
      en: "Structured, coached combat-fitness training for younger members — discipline, coordination, fitness and confidence in a safe format.",
      ar: "تدريب لياقة قتالية منظّم بإشراف كابتن للأعضاء الصغيرين — انضباط وتناسق ولياقة وثقة في نظام آمن.",
    },
    who: {
      en: "Junior members. Age range is set by the club — confirm current groups before booking.",
      ar: "الناشئين. الفئة العمرية بيحددها النادي — اتأكد من الجروبات الحالية قبل الحجز.",
    },
    body: {
      en: [
        "Junior sessions use the same coached, round-based idea at an appropriate level: movement skills, basic striking technique, coordination and fitness games, run by a coach the whole time.",
        "The focus is on discipline, effort and confidence in a controlled, supervised environment.",
        "Contact the club to confirm the current age groups and session times before booking a trial.",
      ],
      ar: [
        "سيشنز الناشئين بتستخدم نفس فكرة الراوندات بإشراف كابتن بس على مستوى مناسب: مهارات حركة، وأساسيات الضرب، وتناسق، وألعاب لياقة، وكابتن معاهم طول الوقت.",
        "التركيز على الانضباط والمجهود والثقة في بيئة متحكم فيها وتحت إشراف.",
        "كلم النادي عشان تتأكد من الفئات العمرية ومواعيد السيشنز الحالية قبل ما تحجز تجربة.",
      ],
    },
    focus: {
      en: ["Discipline", "Coordination", "Fitness", "Confidence", "Coached & supervised"],
      ar: ["انضباط", "تناسق حركي", "لياقة", "ثقة", "بإشراف كامل"],
    },
    ctaLabel: { en: "Book a trial", ar: "احجز تجربة" },
    trialValue: "Kids / Junior",
  },
];

export const PROGRAM_SLUGS = PROGRAMS.map((p) => p.slug);

export function getProgram(slug: string): Program | undefined {
  return PROGRAMS.find((p) => p.slug === slug);
}

/**
 * Options for the trial form's "preferred program" select. The `value` is
 * what reaches the CRM (English); the `label` is what the visitor reads.
 */
export function trialProgramOptions(lang: Lang): Array<{ value: string; label: string }> {
  return [
    ...PROGRAMS.map((p) => ({ value: p.trialValue, label: p.name[lang] })),
    {
      value: "Not sure — help me choose",
      label: lang === "ar" ? "مش متأكد — ساعدوني أختار" : "Not sure — help me choose",
    },
  ];
}
