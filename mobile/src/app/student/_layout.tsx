import { Tabs } from 'expo-router';
import { tabIcon } from '@/components/MenuList';
import { colors } from '@/components/ui';

export default function StudentTabs() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, headerTitleStyle: { fontWeight: '700' } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance', tabBarIcon: tabIcon('calendar-outline') }} />
      <Tabs.Screen name="results" options={{ title: 'Results', tabBarIcon: tabIcon('ribbon-outline') }} />
      <Tabs.Screen name="fees" options={{ title: 'Fees', tabBarIcon: tabIcon('wallet-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('menu-outline') }} />
      <Tabs.Screen name="notices" options={{ title: 'Notices', href: null }} />
    </Tabs>
  );
}
