import { type ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: ReactNode }) {
  // Created once per app instance (useState initializer, not useMemo — the
  // client owns a cache and subscriptions that must survive re-renders).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A fitness app used mid-workout on flaky gym wifi should show
            // cached data instantly and refetch quietly in the background,
            // not block on the network — see docs/phase-1/08-state-management.md §8.5.
            staleTime: 30_000,
            retry: 2,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
