import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, Text, View, type ColorValue } from 'react-native';
import { colors } from './ui';

export interface MenuItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href?: Href;
  onPress?: () => void;
  danger?: boolean;
}

export function MenuList({ items }: { items: MenuItem[] }) {
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
      {items.map((item, i) => (
        <Pressable
          key={item.label}
          onPress={item.onPress ?? (() => item.href && router.push(item.href))}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 15,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: colors.border,
            backgroundColor: pressed ? '#f9fafb' : colors.card,
          })}
        >
          <Ionicons name={item.icon} size={20} color={item.danger ? colors.danger : colors.primary} />
          <Text style={{ flex: 1, fontSize: 15, color: item.danger ? colors.danger : colors.text }}>{item.label}</Text>
          {item.danger ? null : <Ionicons name="chevron-forward" size={18} color="#9ca3af" />}
        </Pressable>
      ))}
    </View>
  );
}

export function tabIcon(name: keyof typeof Ionicons.glyphMap) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  };
}
