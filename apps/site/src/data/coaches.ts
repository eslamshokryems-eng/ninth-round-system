export interface Coach {
  id: string;
  name: { en: string; ar: string };
  role: { en: string; ar: string };
  achievement: { en: string; ar: string };
  photoUrl: string | null;
}

// Photo placeholders — no coach photos supplied yet, only gym interior
// shots. See IMAGES.md for exactly what's needed per coach.
export const COACHES: Coach[] = [
  {
    id: "amr-habish",
    name: { en: "Coach Amr Habish", ar: "الكابتن عمرو حبيش" },
    role: { en: "Boxing", ar: "بوكسينج" },
    achievement: { en: "Africa Champion", ar: "بطل أفريقيا" },
    photoUrl: null,
  },
  {
    id: "mohamed-abdelhamid",
    name: { en: "Coach Mohamed Abdelhamid", ar: "الكابتن محمد عبدالحميد" },
    role: { en: "MMA & Kickboxing", ar: "MMA وكيك بوكسينج" },
    achievement: { en: "Coaches adults and kids", ar: "بيدرب كبار وصغار" },
    photoUrl: null,
  },
  {
    id: "karim-elbadry",
    name: { en: "Coach Karim El-Badry", ar: "الكابتن كريم البدري" },
    role: { en: "Strength & Conditioning", ar: "قوة وتكييف بدني" },
    achievement: {
      en: "Technical Director at Al Tursana SC, former national team player",
      ar: "المدير الفني لنادي الترسانة، لاعب سابق في المنتخب",
    },
    photoUrl: null,
  },
];
