# 7. Component Architecture (Phase 1)

## 7.1 Three Layers, Enforced by Import Direction

```
packages/ui/tokens   →   packages/ui/{native,web}   →   apps/*/src/components   →   apps/*/src/features/*/components
```

An import is only allowed to point **left-to-right** in that chain, never backward — `packages/ui` never imports from an app, and a shared `components/Button` never imports from a feature. This is enforced by an ESLint `no-restricted-imports` rule per package (see [Coding Standards §11.2](11-coding-standards.md#112-import-boundaries)), not just convention, so it can't silently rot.

1. **`packages/ui/tokens`** — pure data: color/spacing/radius/type-scale constants. No JSX, no framework import. This is what makes "black canvas, white content, gold earned" (per [`docs/06-ui-flow-and-wireframes.md §6.1`](../06-ui-flow-and-wireframes.md#61-design-system-tokens)) a single source of truth instead of a copy-pasted hex code in twelve files.
2. **`packages/ui/native` and `packages/ui/web`** — dumb, reusable primitives built directly on the tokens: `Button`, `Card`, `GlassPanel`, `Pill`, `TimerRing`, `Sheet`. Every primitive takes explicit props for the states it supports (`variant`, `size`, `disabled`) — no primitive reaches into global state or fetches data.
3. **`apps/*/src/components`** — app-specific but feature-agnostic composites built from `packages/ui` primitives: `AppHeader`, `TabBar`, `EmptyState`. Still no data-fetching.
4. **`apps/*/src/features/<name>/components`** — feature components. This is the only layer allowed to call hooks from `packages/api-client` or read from a feature's Zustand store.

## 7.2 Container / Presentation Split Within a Feature

Every screen-level component in a feature folder follows the same shape:

- **`<Screen>Container`** (e.g. `WorkoutPlayerContainer`) — owns data fetching (`packages/api-client` hooks) and feature state (Zustand), and is the only thing registered on an Expo Router / Next.js route. Contains no JSX layout beyond passing props down.
- **`<Screen>View`** (e.g. `WorkoutPlayerView`) — pure presentation, receives everything as props, independently testable/storyboard-able with fake data, and is what a designer/QA reviews without needing live data.

This split is what lets `docs/06`'s wireframe board be a faithful preview of the real screen — the `View` component's props are exactly the wireframe's visual inputs.

## 7.3 Worked Example — Workout Player Composition

```
WorkoutPlayerContainer                          (apps/mobile/src/features/workouts)
└── WorkoutPlayerView
    ├── RoundIndicator            (feature component — "Round 3 of 9")
    ├── TimerRing                 (packages/ui/native — gold arc, work/rest color state)
    ├── ExerciseCard
    │   ├── VideoThumbnail        (feature component, wraps a shared VideoPlayer primitive)
    │   └── ExerciseName          (shared Text primitive, feature-styled)
    └── PlayerControls
        ├── IconButton × 2        (packages/ui/native)
        └── IconButton.main       (packages/ui/native — gold, primary)
```

`TimerRing` takes `{ progress: number; state: "work" | "rest"; label: string }` — it has no idea what a "9-Round" workout is; the *domain* concept (how many rounds, how long each is, what state comes next) lives in `packages/domain/training`, called by the container, and only the resulting numbers reach the component. This is why the timer math is unit-testable without mounting any UI.

## 7.4 Cross-Platform Sharing Strategy

| Shared across mobile + web | Platform-specific |
|---|---|
| `packages/ui/tokens`, `packages/types`, `packages/schemas`, `packages/api-client`, `packages/domain` | `packages/ui/native` (NativeWind) vs `packages/ui/web` (shadcn/ui) — same *props contract* where a component exists on both (e.g. both export a `Button` with the same prop shape), different implementation |
| Feature business logic (what a "completed workout" means, entitlement checks) | Feature *screens* — mobile screens and admin screens are different enough (touch/timer-driven vs. table/form-driven) that they are not shared components, only shared data hooks |

## 7.5 Component Prop Conventions

- Every component's props are an explicit `interface <Name>Props`, never inline object types, so it shows up cleanly in editor tooltips and can be exported for Storybook/testing.
- Boolean props read as a state, not a negation (`isLoading`, not `notLoaded`).
- A component that can render empty/loading/error never hides that as an implicit `null` return — `View` components take explicit `status: "loading" | "empty" | "error" | "ready"` where a screen has those states, so the presentational component's rendering is exhaustive and reviewable.
- No component reaches more than one level into a prop object (`workout.name`, not `workout.program.week.workout.name`) — the container flattens/selects what a `View` needs.

Next: [State Management →](08-state-management.md)
