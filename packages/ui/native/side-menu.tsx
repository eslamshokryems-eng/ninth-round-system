import { Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { Text } from "./text";

export interface SideMenuItem {
  key: string;
  label: string;
  onPress: () => void;
}

export interface SideMenuProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: SideMenuItem[];
}

/**
 * The Reception "tasks" side bar (Memberships / Receipts / Expenses /
 * Other Sales) — a slide-in panel over a tap-to-dismiss backdrop, not a
 * full drawer-navigator restructure of the routing tree (`(reception)`
 * stays a plain Stack). Mounted per-screen where needed rather than at
 * the layout level, matching how BackButton/IconButton are already used
 * ad hoc per screen in this app.
 */
export function SideMenu({ visible, onClose, title, items }: SideMenuProps) {
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration: 220 }),
  }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(visible ? 0 : -288, { duration: 260 }) }],
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Animated.View style={[{ flex: 1 }, backdropStyle]} className="bg-black/60">
          <Pressable
            style={{ flex: 1 }}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={title}
          />
        </Animated.View>
        <Animated.View
          style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width: 288 }, panelStyle]}
          className="bg-surface"
        >
          <SafeAreaView edges={["top", "bottom"]} className="flex-1 gap-1 px-4 py-4">
            <Text variant="title" color="gold" style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
              {title}
            </Text>
            {items.map((item) => (
              <Pressable
                key={item.key}
                onPress={item.onPress}
                accessibilityRole="button"
                className="rounded-card px-4 py-4 active:bg-white/[0.06]"
              >
                <Text variant="body">{item.label}</Text>
              </Pressable>
            ))}
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}
