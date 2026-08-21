export interface StatCardProps {
  label: string;
  value: string | number;
  tone?: "default" | "warning";
  icon?: () => JSX.Element;
  hint?: string;
}

export function StatCard({ label, value, tone = "default", icon: Icon, hint }: StatCardProps) {
  return (
    <div className="flex-1 rounded-card border border-white/5 bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
          <p className={`mt-2 text-3xl font-semibold ${tone === "warning" ? "text-red-400" : "text-gold"}`}>{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
        </div>
        {Icon ? (
          <div
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${
              tone === "warning" ? "bg-red-500/10 text-red-400" : "bg-gold/10 text-gold"
            }`}
          >
            <Icon />
          </div>
        ) : null}
      </div>
    </div>
  );
}
