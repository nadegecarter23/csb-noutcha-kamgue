import { Text } from '../src/typography';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  api,
  clearCurrentPayment,
  getCurrentPayment,
  type MobileMoneyPayment,
  saveCurrentPayment,
} from '@/api';
import { BrandMark, colors, common, Money, Notice, ProviderLogo, Screen } from '@/ui';

export default function Waiting() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [payment, setPayment] = useState<MobileMoneyPayment>();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    void getCurrentPayment().then((current) => current && setPayment(current));
    let active = true;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!active) return;
      try {
        const next = await api.get<MobileMoneyPayment>(`/parent/payments/${id}/status`);
        setPayment(next);
        await saveCurrentPayment(next);
        if (next.status === 'SUCCESS') {
          await clearCurrentPayment();
          router.replace({
            pathname: '/payment-success',
            params: {
              id: next.id,
              receiptId: next.receiptId ?? '',
              amount: String(next.amount),
              balance: String(next.balanceAfter ?? 0),
            },
          });
          return;
        }
        if (next.status === 'FAILED') {
          await clearCurrentPayment();
          router.replace({
            pathname: '/payment-failed',
            params: { id: next.id, confirmed: 'true', reason: next.statusReason ?? '' },
          });
          return;
        }
      } catch {
        /* Une coupure réseau ne doit pas transformer le paiement en échec. */
      }
      setSeconds(Math.floor((Date.now() - started) / 1000));
      timer = setTimeout(() => void poll(), Date.now() - started < 30000 ? 3000 : 10000);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id]);
  const abandon = async () => {
    try {
      await api.post(`/parent/payments/${id}/cancel`);
    } finally {
      router.replace('/home');
    }
  };
  const provider = payment?.provider === 'ORANGE_MONEY' ? 'ORANGE_MONEY' : 'MTN_MOMO';
  return (
    <Screen backgroundColor={colors.surface}>
      <View style={styles.header}>
        <BrandMark />
      </View>
      <View style={styles.content}>
        <View style={styles.progressRing}>
          <ActivityIndicator size="large" color={colors.brand} />
          <View style={styles.phoneIcon}>
            <Ionicons name="phone-portrait-outline" size={25} color={colors.brand} />
          </View>
        </View>
        <Text style={styles.title}>Validation en cours</Text>
        <Text style={styles.description}>
          Confirmez la demande sur votre téléphone. Cette page se met à jour automatiquement.
        </Text>
        <View style={styles.provider}>
          <ProviderLogo provider={provider} />
        </View>
        <Money value={payment?.amount ?? 0} style={styles.amount} />
        <View style={styles.steps}>
          <Step done label="Demande envoyée" />
          <View style={styles.stepLine} />
          <Step active label="Confirmation opérateur" />
          <View style={styles.stepLine} />
          <Step label="Reçu CSB-NK" />
        </View>
        {seconds >= 300 ? (
          <Notice tone="warning" icon="time-outline">
            Le délai opérateur est dépassé. Le paiement reste en vérification et n’est pas déclaré
            échoué.
          </Notice>
        ) : (
          <Notice icon="shield-checkmark-outline">
            Ne relancez pas un second paiement pendant cette vérification.
          </Notice>
        )}
      </View>
      <Pressable style={common.link} onPress={() => void abandon()}>
        <Text style={common.linkText}>Quitter le suivi</Text>
      </Pressable>
    </Screen>
  );
}

function Step({
  label,
  done = false,
  active = false,
}: {
  label: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepDot, done && styles.stepDone, active && styles.stepActive]}>
        {done ? <Ionicons name="checkmark" size={14} color={colors.surface} /> : null}
      </View>
      <Text style={[styles.stepLabel, (done || active) && styles.stepLabelActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 8 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15 },
  progressRing: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  phoneIcon: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.forest,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '900',
    textAlign: 'center',
  },
  description: {
    maxWidth: 330,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  provider: {
    width: 142,
    height: 61,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surface,
    padding: 4,
  },
  amount: { color: colors.forest, fontSize: 26, lineHeight: 32 },
  steps: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginVertical: 10,
  },
  step: { width: 88, alignItems: 'center', gap: 6 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDone: { borderColor: colors.success, backgroundColor: colors.success },
  stepActive: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  stepLine: { width: 24, height: 2, marginTop: 12, backgroundColor: colors.line },
  stepLabel: { color: colors.muted, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  stepLabelActive: { color: colors.ink, fontWeight: '700' },
});
