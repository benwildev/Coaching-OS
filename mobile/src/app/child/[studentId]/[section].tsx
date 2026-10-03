import { Stack, useLocalSearchParams } from 'expo-router';
import { AttendanceScreen, FeesScreen, HomeworkScreen, MaterialsScreen, ResultsScreen } from '@/screens/shared';
import { ErrorView } from '@/components/ui';

const SECTIONS = {
  attendance: { title: 'Attendance', Component: AttendanceScreen },
  results: { title: 'Results', Component: ResultsScreen },
  fees: { title: 'Fees & Payments', Component: FeesScreen },
  homework: { title: 'Homework', Component: HomeworkScreen },
  materials: { title: 'Study Materials', Component: MaterialsScreen },
} as const;

export default function ChildSection() {
  const { studentId, section } = useLocalSearchParams<{ studentId: string; section: string }>();
  const entry = SECTIONS[section as keyof typeof SECTIONS];
  if (!entry) return <ErrorView error={new Error('Page not found.')} />;
  const { title, Component } = entry;
  return (
    <>
      <Stack.Screen options={{ title }} />
      <Component childId={studentId} />
    </>
  );
}
