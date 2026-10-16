import { TextInput, Text } from '../../src/typography';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { apiRequest, type MobileMoneyPayment, saveCurrentPayment } from '@/api';
import {
  Button,
  colors,
  common,
  Field,
  Money,
  Notice,
  PageHeader,
  ProviderLogo,
  Screen,
} from '@/ui';

export default function Pay() {
  const { id, enrollmentId, balance, name } = useLocalSearchParams<{
    id: string;
    enrollmentId: string;
    balance: string;
    name: string;
  }>();
  const max = Number(balance);
  const [amount, setAmount] = useState(String(max));
  const [phone, setPhone] = useState('+2376');
  const [provider, setProvider] = useState<'MTN_MOMO' | 'ORANGE_MONEY'>('MTN_MOMO');
  const [preview, setPreview] = useState<{
    allocated: number;
    unallocated: number;
    balanceAfter: number;
  }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const value = Number(amount);
    if (!value) return;
    const timer = setTimeout(
      () =>
        void apiRequest<{ allocated: number; unallocated: number; balanceAfter: number }>(
          `/parent/simulate-allocation?enrollmentId=${enrollmentId}&amount=${value}`,
        )
          .then(setPreview)
          .catch(() => setPreview(undefined)),
      350,
    );
    return () => clearTimeout(timer);
  }, [amount, enrollmentId]);
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const payment = await apiRequest<MobileMoneyPayment>('/parent/payments', {
        method: 'POST',
        idempotencyKey: `mobile-${Date.now()}-${Math.random()}`,
        body: { studentId: id, enrollmentId, amount: Number(amount), provider, payerPhone: phone },
      });
      await saveCurrentPayment(payment);
      router.replace({ pathname: '/payment-waiting', params: { id: payment.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Paiement impossible.');
    } finally {
      setBusy(false);
    }
  };
  const valid = Number(amount) > 0 && Number(amount) <= max && /^\+237\d{9}$/.test(phone);
  const quickAmounts = [Math.min(max, 20000), Math.min(max, 50000), max].filter(
    (value, index, values) => value > 0 && values.indexOf(value) === index,
  );
  return (
    <Screen backgroundColor={colors.surface}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PageHeader title="Paiement des frais" back />
        <View style={styles.studentCard}>
          <View style={styles.avatar}>
            <Ionicons name="person-outline" size={25} color={colors.brand} />
          </View>
          <View style={styles.studentCopy}>
            <Text style={styles.studentName}>{name}</Text>
            <Text style={common.caption}>Inscription en cours</Text>
          </View>
          <View style={styles.balance}>
            <Text style={common.caption}>Reste à payer</Text>
            <Money value={max} style={styles.balanceAmount} />
          </View>
        </View>
        <Field label="Montant à payer">
          <View style={styles.amountInput}>
            <TextInput
              testID="payment-amount"
              accessibilityLabel="Montant à payer"
              style={styles.amountText}
              keyboardType="number-pad"
              value={amount}
              onChangeText={setAmount}
            />
            <Text style={styles.currency}>FCFA</Text>
          </View>
        </Field>
        <View style={styles.quickAmounts}>
          {quickAmounts.map((value) => (
            <Pressable
              key={value}
              onPress={() => setAmount(String(value))}
              style={[styles.amountChip, Number(amount) === value && styles.amountChipSelected]}
            >
              <Text
                style={[
                  styles.amountChipText,
                  Number(amount) === value && styles.amountChipTextSelected,
                ]}
              >
                {value === max ? 'Tout payer' : value.toLocaleString('fr-CM')}
              </Text>
            </Pressable>
          ))}
        </View>
        <Field label="Choisir l’opérateur Mobile Money">
          <View style={styles.providers}>
            {(['MTN_MOMO', 'ORANGE_MONEY'] as const).map((value) => (
              <Pressable
                key={value}
                testID={`payment-provider-${value}`}
                accessibilityLabel={value === 'MTN_MOMO' ? 'MTN MoMo' : 'Orange Money'}
                onPress={() => setProvider(value)}
                style={[styles.providerCard, provider === value && styles.providerSelected]}
              >
                <View style={[styles.radio, provider === value && styles.radioSelected]}>
                  {provider === value ? <View style={styles.radioDot} /> : null}
                </View>
                <ProviderLogo provider={value} />
                <Text style={styles.providerName}>
                  {value === 'MTN_MOMO' ? 'MTN MoMo' : 'Orange Money'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>
        <Field label="Numéro à débiter" hint="Le numéro doit commencer par +237.">
          <TextInput
            testID="payment-phone"
            accessibilityLabel="Numéro à débiter"
            style={common.input}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            placeholder="+237 6XX XX XX XX"
          />
        </Field>
        {preview ? (
          <View style={styles.allocation}>
            <Text style={styles.allocationTitle}>Affectation du paiement</Text>
            <AllocationRow label="Montant affecté aux frais" value={preview.allocated} />
            <AllocationRow label="Solde après paiement" value={preview.balanceAfter} emphasize />
            {preview.unallocated > 0 ? (
              <AllocationRow label="Avance non affectée" value={preview.unallocated} />
            ) : null}
          </View>
        ) : null}
        <Notice icon="shield-checkmark-outline">
          Le CSB Noutcha KAMGUE ne vous demandera jamais votre code secret. Vous confirmerez la
          transaction directement sur votre téléphone.
        </Notice>
        {error ? (
          <Notice tone="danger" icon="alert-circle-outline">
            {error}
          </Notice>
        ) : null}
        <Button
          label={
            busy
              ? 'Initialisation…'
              : `Confirmer ${Number(amount || 0).toLocaleString('fr-CM')} FCFA`
          }
          icon="lock-closed-outline"
          disabled={busy || !valid}
          onPress={() => void submit()}
        />
      </ScrollView>
    </Screen>
  );
}

function AllocationRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <View style={[styles.allocationRow, emphasize && styles.allocationEmphasize]}>
      <Text style={emphasize ? styles.allocationStrong : common.caption}>{label}</Text>
      <Money
        value={value}
        style={emphasize ? styles.allocationMoneyStrong : styles.allocationMoney}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 30 },
  studentCard: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: '#cadbd2',
    borderRadius: 13,
    backgroundColor: colors.brandSoft,
    padding: 13,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentCopy: { flex: 1 },
  studentName: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  balance: { alignItems: 'flex-end' },
  balanceAmount: { color: colors.danger, fontSize: 14, lineHeight: 19 },
  amountInput: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderRadius: 11,
    backgroundColor: colors.surface,
  },
  amountText: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: 15,
    color: colors.forest,
    fontSize: 22,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  currency: { paddingRight: 15, color: colors.muted, fontSize: 13, fontWeight: '800' },
  quickAmounts: { flexDirection: 'row', gap: 8 },
  amountChip: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountChipSelected: { borderColor: colors.brand, backgroundColor: colors.brand },
  amountChipText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  amountChipTextSelected: { color: colors.surface },
  providers: { flexDirection: 'row', gap: 10 },
  providerCard: {
    flex: 1,
    minHeight: 112,
    position: 'relative',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerSelected: { borderColor: colors.brand, backgroundColor: '#f3f8f4' },
  radio: {
    position: 'absolute',
    left: 9,
    top: 9,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#8ba598',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  radioSelected: { borderColor: colors.brand },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
  providerName: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  allocation: {
    borderWidth: 1,
    borderColor: '#cadbd2',
    borderRadius: 13,
    backgroundColor: '#f3f8f4',
    padding: 14,
  },
  allocationTitle: { color: colors.forest, fontSize: 14, fontWeight: '800', marginBottom: 6 },
  allocationRow: {
    minHeight: 35,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  allocationEmphasize: {
    marginTop: 5,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  allocationStrong: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  allocationMoney: { fontSize: 12, lineHeight: 17 },
  allocationMoneyStrong: { color: colors.brand, fontSize: 14, lineHeight: 19 },
});
