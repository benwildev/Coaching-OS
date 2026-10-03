import { MoreMenu } from '@/screens/MoreMenu';

export default function More() {
  return (
    <MoreMenu
      items={[
        { label: 'Homework', icon: 'document-text-outline', href: '/homework' },
        { label: 'Exams', icon: 'school-outline', href: '/exams' },
        { label: 'Class routine', icon: 'time-outline', href: '/timetable' },
        { label: 'Study materials', icon: 'library-outline', href: '/materials' },
        { label: 'Notices', icon: 'megaphone-outline', href: '/student/notices' },
        { label: 'Notifications', icon: 'notifications-outline', href: '/notifications' },
        { label: 'My profile', icon: 'person-outline', href: '/profile' },
      ]}
    />
  );
}
