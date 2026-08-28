import type { site } from "@/content/site.config";

type Coach = (typeof site.coaches)[number];

export function CoachCard({ coach }: { coach: Coach }) {
  return (
    <article className="overflow-hidden rounded-card border border-white/10 bg-ink-850">
      <div
        aria-hidden={coach.photo ? undefined : "true"}
        className="aspect-[4/5] w-full bg-ink-800"
        style={
          coach.photo
            ? { backgroundImage: `url(${coach.photo})`, backgroundSize: "cover", backgroundPosition: "center" }
            : {
                background:
                  "linear-gradient(180deg,#1D1D20,#141416), radial-gradient(300px 160px at 50% 0%, rgba(228,20,27,0.22), transparent 70%)",
              }
        }
      >
        {!coach.photo ? (
          <div className="flex h-full items-end p-5">
            <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ash/60">Photo to be added</span>
          </div>
        ) : null}
      </div>
      <div className="p-6">
        <h3 className="font-display text-xl uppercase tracking-wide text-bone">{coach.name}</h3>
        <p className="mt-0.5 text-sm text-blood-bright">{coach.role}</p>
        {coach.credentials.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {coach.credentials.map((c) => (
              <li key={c} className="rounded-pill border border-white/15 px-2.5 py-0.5 text-xs text-ash">
                {c}
              </li>
            ))}
          </ul>
        ) : null}
        {coach.bio ? <p className="mt-4 text-sm leading-relaxed text-ash">{coach.bio}</p> : null}
      </div>
    </article>
  );
}
