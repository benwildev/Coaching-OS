import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query';
import { Loading } from '@/components/ui';

function RootStack() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  const signedIn = status === 'signedIn';
  return (
    <Stack screenOptions={{ headerTintColor: '#111827', headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="student" options={{ headerShown: false }} />
        <Stack.Screen name="guardian" options={{ headerShown: false }} />
        <Stack.Screen name="exams" options={{ title: 'Exams' }} />
        <Stack.Screen name="timetable" options={{ title: 'Class Routine' }} />
        <Stack.Screen name="homework/index" options={{ title: 'Homework' }} />
        <Stack.Screen name="homework/[id]" options={{ title: 'Homework' }} />
        <Stack.Screen name="materials" options={{ title: 'Study Materials' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="change-password" options={{ title: 'Change Password' }} />
        <Stack.Screen name="pay/[invoiceId]" options={{ title: 'Pay Invoice' }} />
        <Stack.Screen name="child/[studentId]/index" options={{ title: 'Child' }} />
        <Stack.Screen name="child/[studentId]/[section]" options={{ title: '' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootStack />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
