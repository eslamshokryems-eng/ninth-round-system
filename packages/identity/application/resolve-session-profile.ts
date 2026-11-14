import type { Result } from "@9thround/shared-kernel";
import type { GetCurrentProfileOutput } from "./get-current-profile";

/**
 * What the app should do with a session whose profile it is trying to load.
 *  - `signed-in`   the profile loaded.
 *  - `signed-out`  the profile definitively does not exist (PROFILE_NOT_FOUND): the session is not usable.
 *  - `unavailable` the profile could not be fetched (network blip, mobile data, a 5xx or a database statement timeout).
 *                  The session itself is still valid — the caller must NOT sign the employee out.
 *
 * Before this existed, ANY failure while loading the profile (including a timeout) signed the employee out, so an employee on a slow
 * or unstable connection was bounced to the login page although their session was fine.
 */
export type SessionProfileOutcome =
  | { kind: "signed-in"; profile: GetCurrentProfileOutput }
  | { kind: "signed-out" }
  | { kind: "unavailable" };

export interface ResolveSessionProfileOptions {
  /** Delays (ms) before each retry of a transient failure. Default: 1 s, 3 s, 7 s. */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  /** Stop retrying (component unmounted / session changed). */
  isCancelled?: () => boolean;
}

const DEFAULT_DELAYS = [1000, 3000, 7000];

export async function resolveSessionProfile(
  load: () => Promise<Result<GetCurrentProfileOutput>>,
  options: ResolveSessionProfileOptions = {},
): Promise<SessionProfileOutcome> {
  const delays = options.retryDelaysMs ?? DEFAULT_DELAYS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    const result = await load();
    if (result.isOk) return { kind: "signed-in", profile: result.value };
    if (result.error.code === "PROFILE_NOT_FOUND") return { kind: "signed-out" };
    if (attempt >= delays.length || options.isCancelled?.()) return { kind: "unavailable" };
    await sleep(delays[attempt] as number);
  }
}
