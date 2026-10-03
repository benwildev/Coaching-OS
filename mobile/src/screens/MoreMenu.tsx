import { useAuth } from '@/lib/auth';
import { MenuList, type MenuItem } from '@/components/MenuList';
import { Card, Muted, Screen, Title } from '@/components/ui';

export function MoreMenu({ items }: { items: MenuItem[] }) {
  const { me, signOut } = useAuth();
  return (
    <Screen>
      <Card>
        <Title>{me?.user?.name}</Title>
        <Muted>
          {me?.user?.portalType === 'GUARDIAN' ? 'Guardian' : 'Student'}
          {me?.center?.name ? ` · ${me.center.name}` : ''}
        </Muted>
      </Card>
      <MenuList items={items} />
      <MenuList
        items={[
          { label: 'Change password', icon: 'key-outline', href: '/change-password' },
          { label: 'Sign out', icon: 'log-out-outline', onPress: signOut, danger: true },
        ]}
      />
    </Screen>
  );
}
