"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import Image from "next/image";
import { useAuthStore } from "../../src/features/auth/store";
import { getIdentityModule } from "../../src/lib/composition-root";
import { Button } from "../../src/components/ui/button";

/**
 * The athlete area's shell and auth guard.
 *
 * Deliberately NOT the Reception shell: this is the one part of the web app
 * a `member` account reaches, so it gets a plain header and no staff
 * navigation at all rather than a sidebar with everything filtered out.
 *
 * As with the Reception layout, this guard is a routing convenience, not
 * the security boundary. Every screen under it reads through the same
 * row-level policies as any other client, so a staff member who navigates
 * here sees only what those policies give them, and a member who tries a
 * Reception URL is refused by the database regardless of what this
 * component renders.
 */
export default function MemberLayout({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.role);
  const fullName = useAuthStore((state) => state.fullName);
  const router = useRouter();

  useEffect(() => {
    if (status === "signedOut") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "hydrating") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (status === "signedOut") return null;

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Image src="/emblem-red.png" alt="9th Round" width={32} height={32} />
            <div>
              <p className="text-sm font-semibold text-fg">9th Round Competitions</p>
              {fullName ? <p className="text-xs text-muted">{fullName}</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {role && role !== "member" ? (
              <a href="/dashboard" className="text-xs text-gold underline">
                Staff area
              </a>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => {
                void getIdentityModule().signOut();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
