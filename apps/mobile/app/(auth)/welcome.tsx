import { useRef, useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Dimensions, Pressable, ScrollView, View, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { Button, ProgressDots, ScreenContainer, Text } from "@9thround/ui/native";

const { width } = Dimensions.get("window");

const SLIDES = ["slide1", "slide2", "slide3"] as const;

/**
 * "Beautiful onboarding with premium animations" (docs/phase-1/05-screen-list.md #2) —
 * a 3-slide brand intro shown once, before the user chooses to sign up or
 * log in. Each slide's entrance is animated on becoming active rather than
 * continuously scroll-linked, which keeps the motion real without coupling
 * it to ScrollView's imperative scrollTo (a known rough edge under RTL on
 * Android — flagged for manual QA in docs/phase-1/12-implementation-status.md).
 */
export default function WelcomeScreen() {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  }

  function goToSignUp() {
    router.replace("/(auth)/sign-up");
  }

  function handleNext() {
    if (activeIndex < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: width * (activeIndex + 1), animated: true });
    } else {
      goToSignUp();
    }
  }

  return (
    <ScreenContainer scrollable={false}>
      <View className="flex-row justify-end">
        <Pressable accessibilityRole="button" onPress={goToSignUp} hitSlop={8}>
          <Text color="muted">{t("welcome.skip")}</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        className="flex-1"
      >
        {SLIDES.map((key, index) => (
          <Slide
            key={key}
            isActive={index === activeIndex}
            titleKey={`welcome.${key}.title`}
            subtitleKey={`welcome.${key}.subtitle`}
          />
        ))}
      </ScrollView>

      <View className="gap-6">
        <ProgressDots total={SLIDES.length} current={activeIndex} />
        <Button
          label={activeIndex === SLIDES.length - 1 ? t("welcome.getStarted") : t("common.next")}
          onPress={handleNext}
        />
      </View>
    </ScreenContainer>
  );
}

function Slide({
  isActive,
  titleKey,
  subtitleKey,
}: {
  isActive: boolean;
  titleKey: string;
  subtitleKey: string;
}) {
  const { t } = useTranslation();
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isActive ? 1 : 0.25, { duration: 320 }),
    transform: [{ translateY: withTiming(isActive ? 0 : 12, { duration: 320 }) }],
  }));

  return (
    <View style={{ width }} className="items-center justify-center gap-4 px-6">
      <Animated.View style={animatedStyle} className="items-center gap-4">
        <View className="h-24 w-24 items-center justify-center rounded-pill bg-gold/10 border border-gold/30">
          <Text style={{ fontSize: 40 }}>🥊</Text>
        </View>
        <Text variant="display" style={{ textAlign: "center" }}>
          {t(titleKey)}
        </Text>
        <Text variant="body" color="muted" style={{ textAlign: "center" }}>
          {t(subtitleKey)}
        </Text>
      </Animated.View>
    </View>
  );
}
