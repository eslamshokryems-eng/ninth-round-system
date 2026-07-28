import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { LocaleCode } from "@9thround/shared-kernel";

interface LocaleState {
  /** null until the user makes an explicit choice on the language-picker screen. */
  locale: LocaleCode | null;
  setLocale: (locale: LocaleCode) => void;
}

/**
 * The one pre-auth piece of state worth persisting locally (AsyncStorage —
 * not SecureStore, since a language preference isn't sensitive): so a user
 * who picks Arabic, then closes the app before finishing sign-up, isn't
 * asked to pick it again. Once signed in, `profiles.preferred_locale`
 * becomes the source of truth and this store is kept in sync with it — see
 * docs/11-internationalization.md §11.6.
 */
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: null,
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: "9thround.locale",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
