import { useCallback, useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import type { MemberSearchResult } from "@9thround/reception";
import { BackButton, Button, Card, Text, TextField } from "@9thround/ui/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getReceptionModule } from "../../src/lib/composition-root";

/**
 * "Membership Registration" (docs/phase-1/14-reception-membership.md §14.5)
 * — search by member ID/phone/name, and the entry point to "+ New
 * Membership". Search is live against the real database (no mock data);
 * results are read-only here — a member-detail/edit screen is a later slice.
 */
export default function MembershipScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = useCallback(
    async (value: string) => {
      setQuery(value);
      if (value.trim().length < 2) {
        setResults([]);
        setHasSearched(false);
        return;
      }
      setIsSearching(true);
      const result = await getReceptionModule().searchMembers.execute({ query: value });
      setIsSearching(false);
      setHasSearched(true);
      if (result.isOk) {
        setResults(result.value);
      }
    },
    [],
  );

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-6 py-6">
        <View className="flex-row items-center gap-3">
          <BackButton onPress={() => router.back()} />
          <Text variant="display">{t("reception.membership.title")}</Text>
        </View>

        <TextField
          label={t("reception.membership.searchLabel")}
          placeholder={t("reception.membership.searchPlaceholder")}
          value={query}
          onChangeText={(value) => void runSearch(value)}
          autoCapitalize="none"
        />

        <Button
          label={t("reception.membership.newMembership")}
          onPress={() => router.push("/(reception)/new-membership")}
        />

        {isSearching ? (
          <View className="items-center py-8">
            <ActivityIndicator color="#C9A227" />
          </View>
        ) : (
          <View className="gap-3">
            {results.map((member) => (
              <MemberResultCard key={member.memberId} member={member} />
            ))}
            {hasSearched && results.length === 0 ? (
              <Text variant="body" color="muted" style={{ textAlign: "center" }}>
                {t("reception.membership.noResults")}
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MemberResultCard({ member }: { member: MemberSearchResult }) {
  const { t } = useTranslation();

  const statusLabel = deriveStatusLabel(member.activeMembershipStatus, member.activeMembershipEndDate, t);

  return (
    <Card className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text variant="title">{member.fullName}</Text>
        <Text variant="caption" className={statusLabel.className}>
          {statusLabel.text}
        </Text>
      </View>
      <Text variant="body" color="muted">
        {member.phone} · {member.memberCode}
      </Text>
    </Card>
  );
}

function deriveStatusLabel(
  status: MemberSearchResult["activeMembershipStatus"],
  endDate: string | null,
  t: (key: string) => string,
): { text: string; className: string } {
  if (status === null) {
    return { text: t("reception.membership.statusNoMembership"), className: "text-muted" };
  }
  if (status === "expired" || status === "cancelled") {
    return { text: t("reception.membership.statusExpired"), className: "text-red-400" };
  }
  if (endDate) {
    const daysLeft = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) {
      return { text: t("reception.membership.statusExpiringSoon"), className: "text-red-400" };
    }
  }
  return { text: t("reception.membership.statusActive"), className: "text-gold" };
}
