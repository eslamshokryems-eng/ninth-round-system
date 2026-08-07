import { useCallback, useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import type { MemberSearchResult } from "@9thround/reception";
import { BackButton, Button, Card, IconButton, Text, TextField } from "@9thround/ui/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getReceptionModule } from "../../src/lib/composition-root";
import { translateErrorCode } from "../../src/lib/translate-error";

/**
 * "Membership Registration" (docs/phase-1/14-reception-membership.md §14.5)
 * — search by member ID/phone/name, and the entry point to "+ New
 * Membership". Search is live against the real database (no mock data); a
 * result card opens the member detail/edit screen, and its renew icon
 * jumps straight to the one-click renewal flow.
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
  const [checkInFeedback, setCheckInFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const statusLabel = deriveStatusLabel(member.activeMembershipStatus, member.activeMembershipEndDate, t);

  async function handleCheckIn() {
    setIsCheckingIn(true);
    setCheckInFeedback(null);
    const result = await getReceptionModule().checkInMember.execute(member.memberId);
    setIsCheckingIn(false);
    if (result.isErr) {
      setCheckInFeedback({ text: t(translateErrorCode(result.error.code)), isError: true });
      return;
    }
    setCheckInFeedback({ text: t("reception.membership.checkInSuccess"), isError: false });
  }

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/(reception)/member-detail",
          params: { memberId: member.memberId },
        })
      }
    >
      <Card className="gap-1">
        <View className="flex-row items-center justify-between">
          <Text variant="title">{member.fullName}</Text>
          <Text variant="caption" className={statusLabel.className}>
            {statusLabel.text}
          </Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text variant="body" color="muted">
            {member.phone} · {member.memberCode}
          </Text>
          <View className="flex-row items-center gap-2">
            {isCheckingIn ? (
              <ActivityIndicator size="small" color="#C9A227" />
            ) : (
              <IconButton
                name="checkmark-circle-outline"
                size={18}
                accessibilityLabel={t("reception.membership.checkInAction")}
                onPress={() => void handleCheckIn()}
              />
            )}
            <IconButton
              name="refresh"
              size={18}
              accessibilityLabel={t("reception.membership.renewAction")}
              onPress={() =>
                router.push({
                  pathname: "/(reception)/renew-membership",
                  params: { memberId: member.memberId, fullName: member.fullName },
                })
              }
            />
          </View>
        </View>
        {checkInFeedback ? (
          <Text variant="caption" className={checkInFeedback.isError ? "text-red-400" : "text-gold"}>
            {checkInFeedback.text}
          </Text>
        ) : null}
      </Card>
    </Pressable>
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
