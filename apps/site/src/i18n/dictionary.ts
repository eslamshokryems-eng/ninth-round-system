export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export interface Dictionary {
  nav: {
    about: string;
    programs: string;
    coaches: string;
    classes: string;
    contact: string;
    bookTrial: string;
    staffLogin: string;
  };
  hero: {
    kicker: string;
    headline: string;
    sub: string;
    ctaPrimary: string;
    ctaSecondary: string;
    imageAlt: string;
  };
  why: {
    heading: string;
    body: string;
  };
  howItWorks: {
    heading: string;
    body: string;
    stations: string;
  };
  programs: {
    heading: string;
    seeAll: string;
    pageTitle: string;
    pageDescription: string;
  };
  packages: {
    heading: string;
    sub: string;
    duration: string;
    fitPro: string;
    fitProSub: string;
    fighter: string;
    fighterSub: string;
    mostPopular: string;
    month: string;
    months3: string;
    months6: string;
    egp: string;
    tbc: string;
    cta: string;
  };
  coaches: {
    heading: string;
    seeAll: string;
    pageTitle: string;
    pageDescription: string;
  };
  trialCta: {
    heading: string;
    body: string;
    cta: string;
  };
  location: {
    heading: string;
    contactHeading: string;
    whatsapp: string;
    phone: string;
    getDirections: string;
  };
  footer: {
    tagline: string;
    navigate: string;
    contact: string;
    rights: string;
  };
  whatsappSticky: string;
  founder: {
    eyebrow: string;
    headline: string;
    name: string;
    title: string;
    paragraphs: string[];
    experienceStat: string;
    credentialsHeading: string;
    imageAlt: string;
  };
  pages: {
    about: { title: string; description: string };
    classes: { title: string; description: string; scheduleHeading: string; openHours: string; openHoursValue: string; classesHeading: string; classesValue: string };
    contact: { title: string; description: string };
    trial: { title: string; description: string; formName: string; formPhone: string; formProgram: string; formDate: string; formTime: string; formNotes: string; formSubmit: string };
  };
}

export const dictionaries: Record<Locale, Dictionary> = {
  en: {
    nav: {
      about: "About",
      programs: "Programs",
      coaches: "Coaches",
      classes: "Classes",
      contact: "Contact",
      bookTrial: "Book a Free Trial",
      staffLogin: "Staff Login",
    },
    hero: {
      kicker: "Kenpo & Fitness",
      headline: "Train Different.",
      sub: "9 stations · 30 minutes · a coach with you the whole round.",
      ctaPrimary: "Book a Free Trial",
      ctaSecondary: "View Programs",
      imageAlt: "Inside 9th Round — the ring and training floor",
    },
    why: {
      heading: "You don't have to be a pro.",
      body: "You don't have to be a pro. You don't need to have boxed before. 9 stations, 30 minutes, a coach from minute one. We're with you from the start. You're here to learn, not to get hit.",
    },
    howItWorks: {
      heading: "How It Works",
      body: "9 stations, 30 minutes of work — 45 with warm-up and cool-down. Boxing, kickboxing, MMA, Kenpo, strength, and cardio. A coach walks every round with you — this isn't a self-guided circuit.",
      stations: "STATIONS",
    },
    programs: {
      heading: "Programs",
      seeAll: "See all programs",
      pageTitle: "Programs",
      pageDescription: "Boxing, kickboxing, MMA, Kenpo, strength, and cardio at 9th Round.",
    },
    packages: {
      heading: "Packages",
      sub: "Pick your duration. FIGHTER gets you into the classes too.",
      duration: "Duration",
      fitPro: "FIT PRO",
      fitProSub: "Circuit",
      fighter: "FIGHTER",
      fighterSub: "Circuit + Classes",
      mostPopular: "Most Popular",
      month: "1 Month",
      months3: "3 Months",
      months6: "6 Months",
      egp: "EGP",
      tbc: "TBC",
      cta: "Ask About Packages",
    },
    coaches: {
      heading: "Coaches",
      seeAll: "Meet the team",
      pageTitle: "Coaches",
      pageDescription: "The coaches at 9th Round — Kenpo & Fitness.",
    },
    trialCta: {
      heading: "Your First Session Is Free",
      body: "Come as you are. No experience needed. Message us on WhatsApp and we'll get you booked.",
      cta: "Book a Free Trial",
    },
    location: {
      heading: "Location",
      contactHeading: "Contact",
      whatsapp: "WhatsApp",
      phone: "Phone",
      getDirections: "Get Directions",
    },
    footer: {
      tagline: "Train Different. 9 stations, 30 minutes, a coach with you the whole round — boxing, kickboxing, MMA, Kenpo, strength, and cardio.",
      navigate: "Navigate",
      contact: "Contact",
      rights: "All rights reserved.",
    },
    whatsappSticky: "WhatsApp Us",
    founder: {
      eyebrow: "The Founder",
      headline: "Built on Science. Driven by Performance.",
      name: "Islam Shokry",
      title: "Founder & Visionary — 9th Round",
      paragraphs: [
        "I didn't build 9th Round to be just another place to work out.",
        "I built it around a belief that training should be more than exercise. It should be a structured experience that develops physical capability, discipline, confidence, and performance.",
        "My journey in training began in 2007, and over the years I have combined practical coaching experience with an academic foundation in sports science.",
        "I earned a Bachelor of Physical Education in 2008, followed by a Master of Sports Sciences in 2019, focused on physical abilities development and its impact on the skill-related and physiological variables of athletes — alongside professional certification as an ISSA Certified Fitness Trainer.",
        "This combination of science and practical experience became the foundation of 9th Round.",
        "The goal is simple: to create a training system and environment that challenges people, develops their physical abilities, and makes them realize that they are capable of more than they thought.",
        "9th Round is not about simply finishing a workout. It's about becoming better prepared for the next round.",
      ],
      experienceStat: "19+ Years of Training Experience",
      credentialsHeading: "Academic & Professional Credentials",
      imageAlt: "Islam Shokry, Founder of 9th Round",
    },
    pages: {
      about: {
        title: "About",
        description: "About 9th Round — Kenpo & Fitness, founded by Islam Shokry.",
      },
      classes: {
        title: "Classes",
        description: "Circuit hours and class schedule at 9th Round.",
        scheduleHeading: "Schedule",
        openHours: "Circuit — Open Hours",
        openHoursValue: "Daily, 12:00 PM – 11:00 PM. No fixed times — walk in whenever suits you.",
        classesHeading: "MMA / Kickboxing Classes",
        classesValue: "Sunday & Tuesday, 9:00 PM",
      },
      contact: {
        title: "Contact",
        description: "Contact 9th Round — Kenpo & Fitness.",
      },
      trial: {
        title: "Book a Free Trial",
        description: "Book your free trial session at 9th Round.",
        formName: "Full name",
        formPhone: "Phone",
        formProgram: "Preferred program",
        formDate: "Preferred date",
        formTime: "Preferred time",
        formNotes: "Notes (optional)",
        formSubmit: "Request My Free Trial",
      },
    },
  },
  ar: {
    nav: {
      about: "عن الجيم",
      programs: "البرامج",
      coaches: "المدربين",
      classes: "المواعيد",
      contact: "تواصل",
      bookTrial: "احجز حصة تجريبية",
      staffLogin: "دخول الموظفين",
    },
    hero: {
      kicker: "Kenpo & Fitness",
      headline: "Train Different.",
      sub: "9 محطات · 30 دقيقة · مدرب معاك في كل راوند.",
      ctaPrimary: "احجز حصة تجريبية مجانية",
      ctaSecondary: "شوف البرامج",
      imageAlt: "جوه 9th Round — الرينج وأرضية التدريب",
    },
    why: {
      heading: "مش لازم تكون محترف.",
      body: "مش لازم تكون محترف. مش لازم تكون لعبت بوكس قبل كده. 9 محطات، 30 دقيقة، مدرب من أول دقيقة. إحنا معاك من البداية. إنت جاي تتعلم، مش تتضرب.",
    },
    howItWorks: {
      heading: "إزاي بتشتغل",
      body: "9 محطات، 30 دقيقة شغل — 45 دقيقة بالإحماء والتهدئة. بوكسينج، كيك بوكسينج، MMA، كينبو، قوة، وكارديو. مدرب معاك في كل راوند — مش سيركت لوحدك.",
      stations: "محطات",
    },
    programs: {
      heading: "البرامج",
      seeAll: "شوف كل البرامج",
      pageTitle: "البرامج",
      pageDescription: "بوكسينج، كيك بوكسينج، MMA، كينبو، قوة، وكارديو في 9th Round.",
    },
    packages: {
      heading: "الباقات",
      sub: "اختار المدة اللي تناسبك. FIGHTER بيديك الكلاسات كمان.",
      duration: "المدة",
      fitPro: "FIT PRO",
      fitProSub: "سيركت",
      fighter: "FIGHTER",
      fighterSub: "سيركت + كلاسات",
      mostPopular: "الأكتر طلبًا",
      month: "شهر",
      months3: "3 شهور",
      months6: "6 شهور",
      egp: "ج.م",
      tbc: "قريبًا",
      cta: "اسأل عن الباقات",
    },
    coaches: {
      heading: "المدربين",
      seeAll: "اعرف الفريق",
      pageTitle: "المدربين",
      pageDescription: "مدربين 9th Round — Kenpo & Fitness.",
    },
    trialCta: {
      heading: "أول حصة مجانًا",
      body: "تعالى زي ما إنت. مش محتاج خبرة قبل كده. ابعتلنا على الواتساب ونحجزلك.",
      cta: "احجز حصة تجريبية مجانية",
    },
    location: {
      heading: "المكان",
      contactHeading: "تواصل",
      whatsapp: "واتساب",
      phone: "تليفون",
      getDirections: "اعرف الاتجاهات",
    },
    footer: {
      tagline: "Train Different. 9 محطات، 30 دقيقة، مدرب معاك في كل راوند — بوكسينج، كيك بوكسينج، MMA، كينبو، قوة، وكارديو.",
      navigate: "روابط",
      contact: "تواصل",
      rights: "كل الحقوق محفوظة.",
    },
    whatsappSticky: "واتساب",
    founder: {
      eyebrow: "المؤسس",
      headline: "مبني على العلم. مدفوع بالأداء.",
      name: "إسلام شكري",
      title: "المؤسس والرؤية وراء 9th Round",
      paragraphs: [
        "لم أؤسس 9th Round ليكون مجرد مكان آخر للتمرين.",
        "أسست 9th Round انطلاقًا من إيمان بأن التدريب يجب أن يكون أكثر من مجرد ممارسة للتمارين؛ يجب أن يكون تجربة منظمة تطور القدرات البدنية، والانضباط، والثقة، والأداء.",
        "بدأت رحلتي في مجال التدريب عام 2007، وعلى مدار السنوات جمعت بين الخبرة العملية في التدريب وبين الدراسة الأكاديمية المتخصصة في علوم الرياضة.",
        "حصلت على بكالوريوس التربية الرياضية عام 2008، ثم ماجستير العلوم الرياضية عام 2019 في تنمية القدرات البدنية وتأثيرها على المتغيرات المهارية والفسيولوجية لدى اللاعبين، إلى جانب حصولي على شهادة Certified Fitness Trainer (CFT) من ISSA.",
        "هذا المزيج بين العلم والخبرة العملية أصبح أحد الأسس التي بُنيت عليها فلسفة 9th Round.",
        "الهدف بسيط: أن نصنع نظامًا وبيئة تدريبية تتحدى الإنسان، وتطور قدراته البدنية، وتجعله يكتشف أنه قادر على الوصول إلى مستوى أعلى مما كان يعتقد.",
        "9th Round ليست مجرد حصة تنتهي. إنها استعداد للجولة القادمة.",
      ],
      experienceStat: "أكتر من 19 سنة خبرة في التدريب",
      credentialsHeading: "المؤهلات العلمية والمهنية",
      imageAlt: "إسلام شكري، مؤسس 9th Round",
    },
    pages: {
      about: {
        title: "عن الجيم",
        description: "عن 9th Round — Kenpo & Fitness، بقيادة المؤسس إسلام شكري.",
      },
      classes: {
        title: "المواعيد",
        description: "مواعيد السيركت والكلاسات في 9th Round.",
        scheduleHeading: "المواعيد",
        openHours: "السيركت — مواعيد الفتح",
        openHoursValue: "كل يوم، من 12 الضهر لـ 11 بالليل. مفيش مواعيد ثابتة — تعالى في أي وقت يناسبك.",
        classesHeading: "كلاسات MMA / كيك بوكسينج",
        classesValue: "الأحد والثلاثاء، 9 مساءً",
      },
      contact: {
        title: "تواصل",
        description: "تواصل مع 9th Round — Kenpo & Fitness.",
      },
      trial: {
        title: "احجز حصة تجريبية مجانية",
        description: "احجز حصتك التجريبية المجانية في 9th Round.",
        formName: "الاسم بالكامل",
        formPhone: "رقم التليفون",
        formProgram: "البرنامج اللي عايزه",
        formDate: "التاريخ المفضل",
        formTime: "الوقت المفضل",
        formNotes: "ملاحظات (اختياري)",
        formSubmit: "اطلب حصتي المجانية",
      },
    },
  },
};
