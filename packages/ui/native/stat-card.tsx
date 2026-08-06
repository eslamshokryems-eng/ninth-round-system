import { Card } from "./card";
import { Text } from "./text";

export interface StatCardProps {
  label: string;
  value: string | number;
  /** A stat that needs attention (e.g. expired memberships) reads in a warning tone instead of gold. */
  tone?: "default" | "warning";
  className?: string;
}

/**
 * A single dashboard number — built for the Reception Dashboard
 * (docs/phase-1/14-reception-membership.md) but generic enough for any
 * future "N of X" summary tile, so it lives in the shared design system
 * rather than one screen's local component.
 */
export function StatCard({ label, value, tone = "default", className = "" }: StatCardProps) {
  return (
    <Card className={`flex-1 gap-1 ${className}`}>
      {tone === "warning" ? (
        <Text variant="display" className="text-red-400">
          {value}
        </Text>
      ) : (
        <Text variant="display" color="gold">
          {value}
        </Text>
      )}
      <Text variant="caption" color="muted">
        {label}
      </Text>
    </Card>
  );
}
