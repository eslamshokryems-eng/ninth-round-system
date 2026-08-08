export interface StatCardProps {
  label: string;
  value: string | number;
  tone?: "default" | "warning";
}

export function StatCard({ label, value, tone = "default" }: StatCardProps) {
  return (
    <div className="flex-1 rounded-card border border-white/5 bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${tone === "warning" ? "text-red-400" : "text-gold"}`}>{value}</p>
    </div>
  );
}
