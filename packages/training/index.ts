export { RoundPlan, type RoundPlanProps } from "./domain/round-plan";
export type { TimerPhase } from "./domain/timer-phase";

// No composition-root factory yet (contrast with @9thround/identity's
// `createIdentityModule`) — there are no use cases or infrastructure
// implementations to wire together until this context's implementation
// turn comes. See ./README.md and docs/phase-1/12-implementation-status.md.
