import { MoreMenu } from '@/screens/MoreMenu';

export default function More() {
  return (
    <MoreMenu
      items={[
        { label: 'Notifications', icon: 'notifications-outline', href: '/notifications' },
        { label: 'My profile', icon: 'person-outline', href: '/profile' },
      ]}
    />
  );
}
