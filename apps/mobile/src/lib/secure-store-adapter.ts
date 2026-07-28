import * as SecureStore from "expo-secure-store";

/**
 * Supabase Auth's session (JWT access + refresh token) storage, backed by
 * the iOS Keychain / Android Keystore — never AsyncStorage, per
 * docs/07-security-plan.md §7.1 and docs/phase-1/09-authentication-flow.md §9.4.
 *
 * Known limitation, not yet hardened: SecureStore enforces a per-key size
 * limit on some platforms, and a long JWT with several custom claims (see
 * docs/phase-1/09-authentication-flow.md §9.3) could theoretically approach
 * it. Chunking the value across multiple keys if this becomes a real
 * problem is tracked in docs/phase-1/12-implementation-status.md rather
 * than built speculatively now.
 */
export const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};
