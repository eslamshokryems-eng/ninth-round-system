/**
 * English UI copy. This file is the single source of truth for the `Dict`
 * shape — `ar.ts` is typed against it, so a missing Arabic string is a
 * TypeScript error, not a half-translated page in production.
 *
 * Business FACTS (phone, address, prices, photos, coach names) live in
 * `content/site.config.ts`. Only prose lives here.
 */

export const en = {
  switcher: { label: "العربية", aria: "Switch to Arabic" },

  nav: {
    home: "Home",
    programs: "Programs",
    about: "Why 9th Round",
    coaches: "Coaches",
    memberships: "Memberships",
    schedule: "Schedule",
    location: "Location",
    gallery: "Gallery",
    faq: "FAQ",
    events: "Events",
    contact: "Contact",
    menu: "Menu",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    primaryLabel: "Primary",
    mobileLabel: "Mobile",
    footerLabel: "Footer",
    breadcrumbLabel: "Breadcrumb",
    skip: "Skip to content",
    legal: "Legal",
    privacy: "Privacy",
    terms: "Terms",
  },

  cta: {
    trial: "Book a trial",
    trialSubmit: "Book my trial",
    sending: "Sending…",
    programs: "Explore programs",
    whatsapp: "WhatsApp us",
    whatsappLong: "Message us on WhatsApp",
    call: "Call us",
    learnMore: "Learn more",
    join: "Join 9th Round",
    askMemberships: "Ask about memberships",
    meetTeam: "Meet the team",
    backHome: "Back to home",
    contact: "Contact us",
    maps: "Open in Google Maps →",
    seeSchedule: "See the schedule",
    seeGallery: "See the floor",
  },

  hero: {
    eyebrow: "9th Round · Egypt",
    titleTop: "Your first round",
    titleBottom: "starts here",
    body: "Boxing, kickboxing and combat-fitness conditioning — nine rounds, about thirty minutes, a coach on the floor every round. No class times. Come as you are.",
  },

  ticker: ["9 rounds", "30 minutes", "No class times", "Coach-led", "All levels"],

  pillars: {
    eyebrow: "Why 9th Round",
    title: "Not another gym class",
    intro:
      "9th Round is a structured combat-fitness experience — built for beginners and serious athletes training in the same room.",
    items: [
      {
        title: "Structured rounds",
        body: "Nine stations, three minutes each. Every session has a shape — warm-up, strength, striking, core, conditioning — so the work always progresses.",
      },
      {
        title: "Real combat coaching",
        body: "A coach is on the floor every round to teach the movement and fix your form. Boxing and kickboxing technique, not just a follow-along video.",
      },
      {
        title: "Thirty minutes that count",
        body: "The circuit is roughly thirty minutes of actual work. Efficient enough for a real schedule, hard enough to change your conditioning.",
      },
      {
        title: "Progress you can measure",
        body: "Simple monthly checkpoints — push-ups, plank hold, a 30-second jab count — plus a year-long progression through four training phases.",
      },
    ],
  },

  rounds: {
    eyebrow: "The format",
    title: "Nine rounds. Thirty minutes.",
    intro:
      "You move to the next station every three minutes — three short exercises per round with brief rests. Start at any open station, complete all nine.",
    note: "Station content varies day to day, and over a year the programming moves through four phases — Build, Ignite, Challenge and Master.",
    items: [
      { label: "Warm-up", detail: "Jump rope, movement prep" },
      { label: "Strength", detail: "Squat + press patterns" },
      { label: "Boxing", detail: "Med-ball & combinations" },
      { label: "Heavy bag", detail: "Power & output" },
      { label: "Kickboxing", detail: "Kicks, knees, movement" },
      { label: "Sandbag", detail: "Carries & rotational work" },
      { label: "Speed", detail: "Speed ball, hand speed" },
      { label: "Conditioning", detail: "High-intensity intervals" },
      { label: "Core", detail: "The finish — always core" },
    ],
  },

  how: {
    eyebrow: "How it works",
    title: "From first message to first round",
    steps: [
      { title: "Book your trial", body: "Fill the form or message us. The team confirms a time that works for you." },
      { title: "Visit 9th Round", body: "Come in, get shown around, and get set up for your first circuit." },
      {
        title: "Meet your coach",
        body: "A coach walks you through the movements and adjusts everything to your level.",
      },
      {
        title: "Start training",
        body: "Train a full nine-round circuit — real intensity, real coaching, from day one.",
      },
      { title: "Build your program", body: "Afterwards we talk goals and the membership or PT option that fits." },
    ],
  },

  homeSections: {
    programsEyebrow: "Programs",
    programsTitle: "Choose how you train",
    programsIntro: "One format, several ways in — from the group circuit to one-to-one coaching.",
    coachingEyebrow: "Coaching",
    coachingTitle: "Coached every round",
    coachingBody:
      "Every session at 9th Round is led by a coach on the floor — not a screen. They teach the technique, watch your form, and scale each round to where you are.",
    membershipsEyebrow: "Memberships",
    membershipsTitle: "Train on your terms",
    membershipsIntro: "Monthly to annual, plus personal training.",
  },

  gallery: {
    eyebrow: "Inside 9th Round",
    title: "The training floor",
    placeholder: "Real facility photo — to be added",
    pageTitle: "Inside the club",
    pageIntro:
      "The ring, the bags, the floor. Real photography from 9th Round — no stock images standing in for the room you will actually train in.",
    metaDescription: "Photos from inside 9th Round — the ring, the bags and the training floor.",
    empty:
      "Facility photography is being produced. Until it is ready this page stays honest and empty rather than showing pictures of somewhere else. Book a trial and see the floor in person.",
  },

  testimonials: { eyebrow: "Members", title: "What training here is like" },

  faq: {
    eyebrow: "Questions",
    title: "Before your first session",
    pageEyebrow: "FAQ",
    pageTitle: "Everything people ask before round one",
    pageIntro:
      "The questions we get most on WhatsApp, answered. Anything club-specific that changes — times, prices, the address — comes from the team directly.",
    metaDescription:
      "Answers to the most common questions about training at 9th Round — experience needed, session length, what to bring, and how to start.",
    stillAsking: "Still have a question?",
    stillAskingBody: "Message the club and a coach will answer you directly.",
  },

  ctaBand: {
    title: "Come as you are. Learn. Train.",
    subtitle: "Your first session is a trial. Book it in under a minute.",
  },

  programCard: { who: "Who it is for" },

  programPage: {
    eyebrow: "Program",
    whatEyebrow: "What it is",
    whatTitle: "What the training looks like",
    focus: "Focus",
    who: "Who it is for",
    trialTitle: "Book a trial",
    trialNote: "First session is a trial. We will confirm a time with you.",
    othersEyebrow: "Also train",
    othersTitle: "Other programs",
  },

  programsPage: {
    eyebrow: "Programs",
    title: "One format. Several ways in.",
    intro: "Everything runs on the same coached, round-based idea — pick the emphasis that fits your goal.",
    metaDescription:
      "Boxing, kickboxing, the 9-round conditioning circuit, personal training and junior sessions — all coached, all built on the same round-based format.",
  },

  about: {
    eyebrow: "Why 9th Round",
    title: "No classes. No waiting. Just action.",
    intro:
      "9th Round is a structured combat-fitness concept — boxing, kickboxing and conditioning built into a coached, round-based circuit. Serious enough for athletes, open to complete beginners.",
    metaDescription:
      "9th Round is a structured combat-fitness experience in Egypt — a coached, round-based circuit built for beginners and serious athletes alike.",
    ideaEyebrow: "The idea",
    ideaTitle: "A workout with a shape",
    ideaP1:
      "Most gym sessions are whatever you make them. 9th Round has a structure: nine stations, three minutes each, roughly thirty minutes of work. Warm-up, strength, boxing, kickboxing, core and conditioning — in order, every time.",
    ideaP2:
      "There are no booked class slots. You walk in, start at any open station, and complete all nine. A coach is on the floor the whole time to teach the movement and correct your form. The last round is always core.",
    whoEyebrow: "Who it is for",
    whoTitle: "Come as you are",
    whoP1:
      "You do not need boxing experience. The circuit is built so a first-timer and an experienced athlete can train the same session, each working at their own level, with the coach adjusting rounds on the spot.",
    whoP2:
      "It suits people who want to lose weight, get fit, relieve stress, learn to box, or simply train somewhere that is not another treadmill. Men and women train together in the same format.",
    phasesEyebrow: "Progression",
    phasesTitle: "A year with four phases",
    phasesIntro:
      "The programming is not the same session on repeat. Across a year it moves through four phases so the work keeps building.",
    phasesNote:
      "Progress is checked with simple monthly markers — max push-ups, plank hold, a 30-second jab count — so you can see what is changing.",
    phases: [
      { name: "Build", months: "Months 1–3", detail: "Fundamentals, breathing, learning the movements." },
      {
        name: "Ignite",
        months: "Months 4–6",
        detail: "Strength and endurance; kickboxing layered onto strength tools.",
      },
      { name: "Challenge", months: "Months 7–9", detail: "Advanced combat work, HIIT, reaction drills." },
      { name: "Master", months: "Months 10–12", detail: "Full control, sharper output, intelligent ongoing training." },
    ],
  },

  coaches: {
    eyebrow: "Coaches",
    title: "Coached every round",
    intro:
      "A coach is on the floor for every session — teaching the movement, correcting form, and scaling the work to you.",
    metaDescription:
      "The coaches who run the floor at 9th Round — hands-on technique and conditioning coaching every round.",
    more: "More coach profiles are being added. To ask which coach runs a specific session, get in touch.",
    photoPending: "Photo to be added",
  },

  memberships: {
    eyebrow: "Memberships",
    title: "Train on your terms",
    intro:
      "Options from one month to a full year, plus one-to-one personal training. Every membership includes the full 9-round circuit.",
    metaDescription:
      "Monthly, quarterly, six-month and annual memberships at 9th Round, plus personal training. Start with a trial.",
    optionsEyebrow: "Options",
    optionsTitle: "Choose a commitment",
    contactForPricing: "Contact for pricing",
    trialLine: "Your first session can be a trial.",
  },

  schedule: {
    eyebrow: "Schedule",
    title: "When to train",
    intro:
      "The 9-round circuit runs without booked class slots — walk in during opening hours and start at any open station. Coached sessions and groups run at set times.",
    metaDescription:
      "Training times at 9th Round — the open 9-round circuit plus coached sessions and training groups.",
    openEyebrow: "The circuit",
    openTitle: "No class times",
    openBody:
      "The circuit itself has no timetable. You arrive whenever the club is open, join at any free station, and complete all nine rounds. That is the point of the format — no waiting for a class to start.",
    sessionsEyebrow: "Coached sessions",
    sessionsTitle: "Set-time sessions",
    sessionsIntro:
      "These run at fixed times with a coach leading the whole session. Times are confirmed by the club — always check before you travel.",
    groupsEyebrow: "Training groups",
    groupsTitle: "Morning and evening groups",
    groupsIntro:
      "Groups form when enough members want the same slot. Tell us which time suits you and we will add you to the next group that fits.",
    hoursTitle: "Opening hours",
    hoursPending:
      "Opening hours are confirmed by the club — message us on WhatsApp and we will send you the current times.",
    sessionsPending:
      "The current session timetable is confirmed by the club. Message us and we will send you this week's times.",
    confirmNote: "Times can change around holidays and events. The club confirms your slot when you book.",
  },

  location: {
    eyebrow: "Location",
    title: "Find the club",
    intro: "Where to train, how to get here, and what to bring on your first visit.",
    metaDescription: "Where 9th Round is, how to get there, and what to bring for your first session.",
    addressTitle: "Address",
    phoneTitle: "Phone",
    emailTitle: "Email",
    hoursTitle: "Opening hours",
    bringTitle: "What to bring",
    bring: ["Training clothes", "A towel", "Water", "Indoor training shoes"],
    bringNote:
      "Hand wraps and gloves are useful once you keep coming — you do not need your own kit for a first session.",
    pending:
      "The full address and directions are confirmed by the club. Message us on WhatsApp and we will send you the location pin and everything you need for your visit.",
    mapPending: "Map — added when the location is confirmed",
    firstVisitTitle: "Your first visit",
    firstVisitBody:
      "Arrive about ten minutes early. Someone will meet you, show you the floor, and set you up before your first round.",
  },

  events: {
    eyebrow: "Events",
    title: "Compete inside the ring",
    intro:
      "Challenges, in-house competitions and community events built on the same round-based format — scored, timed and open to members.",
    metaDescription:
      "9th Round events and in-house competitions — round-based challenges, scored and timed, open to members and guests.",
    upcomingTitle: "What is on",
    formatEyebrow: "The format",
    formatTitle: "How a 9th Round event runs",
    formatIntro:
      "Events use the club's own language: rounds, stations, a clock and a score. Everyone runs the same nine, and the board decides it.",
    formatItems: [
      { title: "Nine stations", body: "The same circuit structure everybody trains on — no surprise movements." },
      { title: "One clock", body: "Timed rounds, timed transitions. The clock is the referee." },
      { title: "A score, not a vibe", body: "Reps, rounds and time are recorded on a card so the leaderboard is real." },
      { title: "Judged by coaches", body: "Coaches count and hold the standard, so every rep on the board is a rep." },
    ],
    pending:
      "The next event dates are being confirmed. Message the club to be on the list — members hear first, and places are limited by the floor.",
    interestTitle: "Want in on the next one?",
    interestBody: "Tell us and we will message you as soon as the date is set.",
  },

  trial: {
    eyebrow: "Trial",
    title: "Book your first round",
    intro:
      "Leave your details and a preferred time. The team follows up to confirm. Bring training clothes, a towel and water.",
    metaDescription: "Book your first session at 9th Round. Fill the form and the team will confirm a time with you.",
    expectTitle: "What to expect",
    expect: [
      "A short intro and a look around the floor",
      "A coach who sets you up and scales every round",
      "A full nine-round circuit — real intensity from day one",
      "A no-pressure chat afterwards about what fits your goal",
    ],
    ratherTitle: "Rather message us?",
    ratherBody: "Ask a question or book over chat.",
  },

  form: {
    fullName: "Full name",
    phone: "Phone",
    phonePlaceholder: "01x xxx xxxx",
    program: "Preferred program",
    noPreference: "No preference",
    gender: "Gender (optional)",
    preferNotToSay: "Prefer not to say",
    female: "Female",
    male: "Male",
    preferredDate: "Preferred date",
    preferredTime: "Preferred time",
    times: ["Morning", "Afternoon", "Evening"],
    email: "Email (optional)",
    notes: "Anything we should know?",
    consentBefore: "I agree that 9th Round may contact me about my trial. See our",
    consentLink: "privacy note",
    company: "Company",
    genericError: "Something went wrong. Please try again, or message us on WhatsApp.",
    networkError: "Network problem. Please try again, or message us on WhatsApp.",
    unavailableBefore: "Online booking is not available right now.",
    unavailableAfter: "and we will set it up.",
  },

  thankYou: {
    eyebrow: "Trial request received",
    title: "We have got it",
    body: "A coach from 9th Round will contact you to confirm a time. If you would like to sort it faster, message us directly.",
    metaDescription: "Your trial request has been received.",
    metaTitle: "Request received",
    bringTitle: "What to bring",
    bring: ["Training clothes", "A towel", "Water"],
    bringNote:
      "Hand wraps and gloves are useful once you keep coming — you do not need your own kit for a first session.",
  },

  contact: {
    eyebrow: "Contact",
    title: "Get in touch",
    intro: "Book a trial, ask about memberships, or come see the floor.",
    metaDescription: "Get in touch with 9th Round — book a trial, ask about memberships, or find the club.",
    fastestEyebrow: "Talk to us",
    fastestTitle: "Fastest ways to reach the club",
    pending:
      "Full location details are being finalised. Use the trial form or WhatsApp and the team will send you everything you need for your visit.",
  },

  notFound: {
    eyebrow: "Error 404",
    title: "Page not found",
    body: "That page does not exist. Head back and start with a trial.",
  },

  legal: {
    draftNoticePrefix: "Draft wording — to be reviewed and finalised by",
    draftNoticeSuffix: "before launch.",
    privacyTitle: "Privacy note",
    privacyMeta: "How 9th Round handles the information you submit through this website.",
    privacy: [
      {
        h: "What we collect",
        p: "When you submit the trial form, we collect the details you enter: your name, phone number, and optionally your email, preferred program, preferred date and time, and any notes. We also record that the request came from this website.",
      },
      {
        h: "Why we collect it",
        p: "We use these details only to contact you about your trial and to answer your enquiry. Your request is added to our internal customer-management system so our team can follow up with you.",
      },
      {
        h: "Who can see it",
        p: "Your details are visible only to authorised staff. We do not sell your data or share it with unrelated third parties.",
      },
      {
        h: "Analytics",
        p: "This site may use privacy-respecting analytics to understand how pages are used. Analytics data does not include your name, phone number, or email.",
      },
      {
        h: "Your choices",
        p: "To ask what information we hold about you, or to have it removed, contact us using the details on the Contact page.",
      },
    ],
    termsTitle: "Website terms",
    termsMeta: "Terms for using the 9th Round website.",
    terms: [
      {
        h: "Using this site",
        p: "This website provides information about the club and lets you request a trial session. Submitting a request does not confirm a booking — our team will contact you to arrange a time.",
      },
      {
        h: "Accuracy",
        p: "We keep the information here as accurate as we can. Programs, schedules and pricing can change; contact us to confirm current details.",
      },
      { h: "Contact", p: "Questions about these terms can be sent to us via the Contact page." },
    ],
  },

  landing: {
    trustline: "Coached every round · Beginners welcome · Men & women",
    formTitle: "Claim your session",
    formNote: "Leave your number — a coach calls you back to confirm a time.",
    stepsTitle: "What happens next",
    steps: ["You send your details", "A coach calls to confirm a time", "You train a full nine-round circuit"],
    backToSite: "Go to the full site",
  },
};

/**
 * Deliberately NOT `as const`: the dictionary is a shape, not a set of
 * literal values. Widened types let `ar.ts` satisfy `Dict` with its own
 * strings while still failing the build on any missing or misspelled key.
 */
export type Dict = typeof en;
