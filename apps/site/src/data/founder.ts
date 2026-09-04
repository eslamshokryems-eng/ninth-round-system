export interface FounderCredential {
  year: string;
  title: { en: string; ar: string };
}

// Only explicitly verified academic/professional milestones — no invented
// institutions, dates, or credentials. See the founder brief for source.
export const FOUNDER_CREDENTIALS: FounderCredential[] = [
  {
    year: "2007",
    title: { en: "Training Journey Begins", ar: "بداية رحلة التدريب" },
  },
  {
    year: "2008",
    title: { en: "Bachelor of Physical Education", ar: "بكالوريوس التربية الرياضية" },
  },
  {
    year: "2019",
    title: {
      en: "Master of Sports Sciences — Physical Abilities Development & Its Impact on Skill-Related and Physiological Variables in Athletes",
      ar: "ماجستير العلوم الرياضية — تنمية القدرات البدنية وتأثيرها على المتغيرات المهارية والفسيولوجية لدى اللاعبين",
    },
  },
  {
    year: "ISSA",
    title: { en: "Certified Fitness Trainer (CFT)", ar: "شهادة Certified Fitness Trainer (CFT)" },
  },
];
