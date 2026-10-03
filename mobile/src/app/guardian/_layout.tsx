import { Tabs } from 'expo-router';
import { tabIcon } from '@/components/MenuList';
import { colors } from '@/components/ui';

export default function GuardianTabs() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, headerTitleStyle: { fontWeight: '700' } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="children" options={{ title: 'Children', tabBarIcon: tabIcon('people-outline') }} />
      <Tabs.Screen name="notices" options={{ title: 'Notices', tabBarIcon: tabIcon('megaphone-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('menu-outline') }} />
    </Tabs>
  );
}
