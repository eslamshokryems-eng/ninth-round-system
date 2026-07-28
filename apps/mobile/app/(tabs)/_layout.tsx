import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@9thround/ui/tokens";

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: "rgba(255,255,255,0.08)" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("dashboard.tabs.home"),
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="train"
        options={{
          title: t("dashboard.tabs.train"),
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: t("dashboard.tabs.nutrition"),
          tabBarIcon: ({ color, size }) => <Ionicons name="nutrition" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: t("dashboard.tabs.progress"),
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("dashboard.tabs.profile"),
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
