import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { label, money } from '@/lib/format';
import type { PaymentOptions } from '@/lib/types';
import { Body, Button, Card, colors, ErrorView, Input, KeyValue, Loading, Muted, Row, Screen, SectionTitle, Title } from '@/components/ui';

const MANUAL_METHODS = ['BKASH', 'NAGAD', 'BANK', 'CASH', 'OTHER'] as const;

export default function PayInvoice() {
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>();
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ['payment-options', invoiceId],
    queryFn: () => api<PaymentOptions>(`/api/portal/payments/options?invoiceId=${invoiceId}`),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [method, setMethod] = useState<(typeof MANUAL_METHODS)[number]>('BKASH');
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [senderMobile, setSenderMobile] = useState('');
  const [note, setNote] = useState('');

  const refreshFees = () =>
    Promise.all([client.invalidateQueries({ queryKey: ['fees'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]);

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorView error={q.error} onRetry={q.refetch} />;
  const { availableOnlineGateways, manualInstructions, invoiceSummary } = q.data;

  const payOnline = async (provider: string) => {
    setBusy(provider);
    setError(null);
    try {
      const { gatewayUrl } = await api<{ gatewayUrl: string }>(`/api/portal/payments/${invoiceId}/initiate`, { body: { provider } });
      // The gateway returns to the web callback page; once the user closes the
      // browser we just reload the invoice to pick up the new status.
      await WebBrowser.openBrowserAsync(gatewayUrl);
      await refreshFees();
      await q.refetch();
      setDone('If your payment succeeded, the invoice will show as paid shortly.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payment.');
    } finally {
      setBusy(null);
    }
  };

  const submitManual = async () => {
    const value = Number(amount || invoiceSummary?.dueAmount || 0);
    if (!(value > 0)) return setError('Enter the amount you paid.');
    setBusy('manual');
    setError(null);
    try {
      await api(`/api/portal/payments/${invoiceId}/manual-submit`, {
        body: {
          paymentMethod: method,
          amount: value,
          transactionId: transactionId.trim() || undefined,
          senderMobile: senderMobile.trim() || undefined,
          studentNote: note.trim() || undefined,
        },
      });
      await refreshFees();
      setDone('Payment submitted. Your coaching center will verify it soon.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed.');
    } finally {
      setBusy(null);
    }
  };

  if (done) {
    return (
      <Screen>
        <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 28 }}>
          <Title>Thank you</Title>
          <Body style={{ textAlign: 'center' }}>{done}</Body>
          <Button title="Back to fees" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      {invoiceSummary ? (
        <Card>
          <Muted>Invoice {invoiceSummary.invoiceNumber}</Muted>
          <Title>Due {money(invoiceSummary.dueAmount)}</Title>
        </Card>
      ) : null}

      {availableOnlineGateways.length > 0 ? (
        <>
          <SectionTitle>Pay online</SectionTitle>
          {availableOnlineGateways.map((g) => (
            <Button
              key={g.provider}
              title={`Pay with ${g.name}${g.isSandbox ? ' (test)' : ''}`}
              onPress={() => payOnline(g.provider)}
              loading={busy === g.provider}
              disabled={!!busy}
            />
          ))}
        </>
      ) : null}

      {manualInstructions.length > 0 ? (
        <>
          <SectionTitle>Pay manually</SectionTitle>
          {manualInstructions.map((m) => (
            <Card key={m.id}>
              <Title>{label(m.paymentMethod)}</Title>
              {m.accountType ? <KeyValue k="Account type" v={m.accountType} /> : null}
              {m.accountNumber ? <KeyValue k="Account number" v={m.accountNumber} /> : null}
              {m.accountTitle ? <KeyValue k="Account name" v={m.accountTitle} /> : null}
              {m.bankName ? <KeyValue k="Bank" v={m.bankName} /> : null}
              {m.branchName ? <KeyValue k="Branch" v={m.branchName} /> : null}
              {m.instructions ? <Body style={{ marginTop: 6 }}>{m.instructions}</Body> : null}
              {m.instructionsBn ? <Body>{m.instructionsBn}</Body> : null}
            </Card>
          ))}

          <SectionTitle>After paying, submit the details</SectionTitle>
          <Row style={{ flexWrap: 'wrap' }}>
            {MANUAL_METHODS.map((m) => (
              <Pressable
                key={m}
                onPress={() => setMethod(m)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: method === m ? colors.primary : colors.border,
                  backgroundColor: method === m ? colors.primarySoft : colors.card,
                }}
              >
                <Text style={{ color: method === m ? colors.primary : colors.text, fontWeight: '600' }}>{label(m)}</Text>
              </Pressable>
            ))}
          </Row>
          <View style={{ gap: 12 }}>
            <Input
              label="Amount paid"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={invoiceSummary ? String(invoiceSummary.dueAmount) : ''}
            />
            <Input label="Transaction ID" value={transactionId} onChangeText={setTransactionId} autoCapitalize="characters" />
            <Input label="Sender mobile" value={senderMobile} onChangeText={setSenderMobile} keyboardType="phone-pad" />
            <Input label="Note (optional)" value={note} onChangeText={setNote} />
          </View>
          <Button title="Submit payment details" onPress={submitManual} loading={busy === 'manual'} disabled={!!busy} />
        </>
      ) : null}

      {availableOnlineGateways.length === 0 && manualInstructions.length === 0 ? (
        <Card>
          <Body>Online payment is not set up yet. Please pay at your coaching center.</Body>
        </Card>
      ) : null}

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </Screen>
  );
}
