import { Stack } from "expo-router";

/**
 * The staff-facing shell for Reception & Membership (docs/phase-1/14-reception-membership.md) —
 * a separate route group from `(tabs)`, reached only by reception/branch_manager/super_admin
 * (see app/index.tsx's routing gate). Starts as a single Dashboard screen; Member CRUD screens
 * join here as their own routes in the next slice.
 */
export default function ReceptionLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "fade" }} />;
}
