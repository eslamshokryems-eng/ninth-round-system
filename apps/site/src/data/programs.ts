export interface Program {
  slug: string;
  name: { en: string; ar: string };
  tagline: { en: string; ar: string };
  description: { en: string; ar: string };
}

export const PROGRAMS: Program[] = [
  {
    slug: "boxing",
    name: { en: "Boxing", ar: "بوكسينج" },
    tagline: { en: "Stance, footwork, hands.", ar: "وقفة، حركة أرجل، إيد." },
    description: {
      en: "Fundamentals to combinations on the bag — real technique, every station.",
      ar: "من الأساسيات للكومبينيشن على الشكاير — تكنيك حقيقي في كل محطة.",
    },
  },
  {
    slug: "kickboxing",
    name: { en: "Kickboxing", ar: "كيك بوكسينج" },
    tagline: { en: "Strikes and footwork.", ar: "ضربات وحركة أرجل." },
    description: {
      en: "Kicks, knees, and combinations layered onto a high-output conditioning base.",
      ar: "ركلات، ركب، وكومبينيشن فوق أساس كارديو قوي.",
    },
  },
  {
    slug: "mma",
    name: { en: "MMA", ar: "MMA" },
    tagline: { en: "Sunday & Tuesday, 9 PM.", ar: "الأحد والثلاثاء، 9 مساءً." },
    description: {
      en: "Striking and ground fundamentals in one class.",
      ar: "أساسيات الضرب والأرضي في كلاس واحد.",
    },
  },
  {
    slug: "kenpo",
    name: { en: "Kenpo", ar: "كينبو" },
    tagline: { en: "The 9th Round signature.", ar: "بصمة 9th Round." },
    description: {
      en: "Structured striking system — the discipline behind the circuit.",
      ar: "نظام ضرب متسلسل — الانضباط اللي وراء السيركت.",
    },
  },
  {
    slug: "strength",
    name: { en: "Strength", ar: "قوة" },
    tagline: { en: "Built to move, not just lift.", ar: "بتتحرك مش بس بترفع." },
    description: {
      en: "Functional strength stations built for full-body performance.",
      ar: "محطات قوة وظيفية لأداء الجسم كله.",
    },
  },
  {
    slug: "cardio",
    name: { en: "Cardio", ar: "كارديو" },
    tagline: { en: "No dead time.", ar: "مفيش وقت ضايع." },
    description: {
      en: "High-output conditioning between stations — keeps every round honest.",
      ar: "كارديو عالي بين المحطات — بيخلي كل راوند جد.",
    },
  },
];
