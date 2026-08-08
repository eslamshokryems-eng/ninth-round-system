/**
 * Reports (Phase 5) — an honest placeholder, not fake functionality: no
 * reporting use case exists yet in @9thround/reception (revenue trends,
 * exports, etc. would need real design + a new backend slice), so this
 * page says so plainly rather than showing invented numbers.
 */
export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h1 className="mb-3 text-2xl font-semibold text-ink">Reports</h1>
      <p className="text-muted">
        Reporting (revenue trends, exports, and summaries beyond the Dashboard&apos;s live numbers) isn&apos;t built
        yet. The Dashboard, Receipts, and Expiring pages already show real, live data in the meantime.
      </p>
    </div>
  );
}
