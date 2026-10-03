import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, colors, Input, Screen } from '@/components/ui';

export default function ChangePassword() {
  const { replaceToken } = useAuth();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!currentPassword || !newPassword) return setError('Fill in all fields.');
    if (newPassword !== confirm) return setError('New passwords do not match.');
    setError(null);
    setLoading(true);
    try {
      // Changing the password revokes every session; the server reissues ours.
      const result = await api<{ token?: string }>('/api/portal/auth/change-password', {
        body: { currentPassword, newPassword, confirmPassword: confirm },
      });
      if (result.token) await replaceToken(result.token);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Input label="Current password" value={currentPassword} onChangeText={setCurrent} secureTextEntry />
      <Input label="New password" value={newPassword} onChangeText={setNew} secureTextEntry />
      <Input label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry />
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <Button title="Change password" onPress={submit} loading={loading} />
    </Screen>
  );
}
