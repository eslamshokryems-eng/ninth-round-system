/**
 * FAQ content — answers use only verified 9th Round information (the
 * round-based format, "beginners welcome", coach on the floor, free first
 * session as a trial). Anything club-specific that isn't confirmed
 * (prices, exact hours, address) points the visitor to Contact instead of
 * stating a fact.
 */

export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: "Do I need any boxing or fitness experience?",
    a: "No. The 9-round circuit is designed to work for complete beginners and experienced athletes at the same time. A coach is on the floor every round to show you the movement and adjust it to your level. Come as you are.",
  },
  {
    q: "How long is a session?",
    a: "The circuit is nine rounds of about three minutes each — roughly thirty minutes of actual work, plus your own warm-up and cool-down.",
  },
  {
    q: "Are there fixed class times I have to book?",
    a: "The circuit runs without fixed class slots — you start at any open station and complete all nine. Personal training and junior sessions are scheduled separately; the team will confirm a time with you.",
  },
  {
    q: "What happens on my first visit?",
    a: "You book a trial, come in, meet your coach, and train a full circuit with hands-on coaching. Afterwards the team talks through how to keep training and what membership options fit your goal.",
  },
  {
    q: "What should I bring?",
    a: "Training clothes, a towel and water. Hand wraps and gloves are useful once you keep coming, but you don't need your own kit for a first session — ask the coach.",
  },
  {
    q: "Is it for men and women?",
    a: "Yes. 9th Round is built for men and women training together in the same format.",
  },
  {
    q: "How do memberships and pricing work?",
    a: "There are monthly, quarterly, six-month and annual options, plus personal training. For current pricing, contact the club directly — the team will walk you through what suits your goal.",
  },
  {
    q: "How do I get started?",
    a: "Book a trial through the form on this site, or message the club on WhatsApp. The team follows up to confirm a time.",
  },
];
