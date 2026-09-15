export function ShopEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-dashed border-bone/20 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-grey">{message}</p>
    </div>
  );
}
