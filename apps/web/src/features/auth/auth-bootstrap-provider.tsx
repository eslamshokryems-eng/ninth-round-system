"use client";

import type { ReactNode } from "react";
import { useAuthBootstrap } from "./use-auth-bootstrap";
import { useHeartbeat } from "./use-heartbeat";

/** Mounted once at the app root (see app/layout.tsx) so auth state is available to every route, including /login itself. */
export function AuthBootstrapProvider({ children }: { children: ReactNode }) {
  useAuthBootstrap();
  useHeartbeat();
  return <>{children}</>;
}
