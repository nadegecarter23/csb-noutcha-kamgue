import { Text } from '../src/typography';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api, cached } from '@/api';
import {
  BrandMark,
  colors,
  common,
  EmptyState,
  FadeIn,
  Money,
  Notice,
  Screen,
  SectionHeader,
} from '@/ui';

type ChildSummary = {
  studentId: string;
  firstName: string;
  lastName: string;
  schoolName: string;
  className: string | null;
  canViewFinances: boolean;
  balance: { totalDue: number; totalPaid: number; balance: number } | null;
  nextInstallment: { label: string; amount: number; dueDate: string } | null;
};
type Dashboard = {
  children: ChildSummary[];
  totals: { totalDue: number; totalPaid: number; balance: number };
  recentPayments: Array<{
    id: string;
    reference: string;
    amount: number;
    paidAt: string | null;
    studentNames: string[];
  }>;
  unreadNotifications: number;
};

export default function HomeScreen() {
  const [data, setData] = useState<Dashboard>();
  const [offline, setOffline] = useState(false);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await cached('parent.dashboard', () =>
        api.get<Dashboard>('/parent/dashboard'),
      );
      setData(result.data);
      setOffline(result.offline);
      setDate(result.cachedAt);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen navigation>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={busy}
            onRefresh={() => void load()}
            tintColor={colors.brand}
          />
        }
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topbar}>
          <BrandMark />
          <Pressable
            accessibilityLabel="Ouvrir les notifications"
            onPress={() => router.push('/notifications')}
            style={styles.notificationButton}
          >
            <Ionicons name="notifications-outline" size={23} color={colors.forest} />
            {data?.unreadNotifications ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {Math.min(data.unreadNotifications, 9)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        {offline ? (
          <Notice tone="warning" icon="cloud-offline-outline">
            Mode hors ligne · données du {new Date(date).toLocaleString('fr-CM')}
          </Notice>
        ) : null}
        <FadeIn style={styles.welcome}>
          <Text style={styles.welcomeTitle}>Bonjour 👋</Text>
          <Text style={common.subtitle}>Voici la situation scolaire de votre famille.</Text>
        </FadeIn>
        <FadeIn delay={70} style={styles.balanceCard}>
          <View style={styles.balanceAccent} />
          <Text style={styles.balanceLabel}>Solde familial à régler</Text>
          <Money value={data?.totals.balance ?? 0} style={styles.balanceAmount} />
          <View style={styles.balanceMeta}>
            <View>
              <Text style={styles.balanceMetaLabel}>Total attendu</Text>
              <Text style={styles.balanceMetaValue}>
                {(data?.totals.totalDue ?? 0).toLocaleString('fr-CM')} FCFA
              </Text>
            </View>
            <View style={styles.balanceMetaDivider} />
            <View>
              <Text style={styles.balanceMetaLabel}>Déjà payé</Text>
              <Text style={styles.balanceMetaValue}>
                {(data?.totals.totalPaid ?? 0).toLocaleString('fr-CM')} FCFA
              </Text>
            </View>
          </View>
        </FadeIn>
        <SectionHeader
          title="Mes enfants"
          actionLabel="Voir tous"
          onAction={() => router.push('/children' as never)}
        />
        <View style={styles.childList}>
          {data?.children.slice(0, 2).map((child, index) => (
            <ChildRow key={child.studentId} child={child} delay={100 + index * 45} />
          ))}
          {!busy && !data?.children.length ? (
            <EmptyState
              icon="people-outline"
              title="Aucun enfant associé"
              description="Utilisez le code remis par l’établissement pour retrouver le dossier de votre enfant."
              actionLabel="Associer un enfant"
              onAction={() => router.push('/add-child')}
            />
          ) : null}
        </View>
        <View>
          <Text style={common.sectionTitle}>Accès rapides</Text>
          <View style={styles.quickActions}>
            <QuickAction
              icon="qr-code-outline"
              label="Associer"
              onPress={() => router.push('/add-child')}
            />
            <QuickAction
              icon="notifications-outline"
              label="Notifications"
              onPress={() => router.push('/notifications')}
            />
            <QuickAction
              icon="person-outline"
              label="Profil"
              onPress={() => router.push('/profile')}
            />
          </View>
        </View>
        <View style={styles.recentSection}>
          <SectionHeader
            title="Paiement récent"
            actionLabel="Tout voir"
            onAction={() => router.push('/payments')}
          />
          {data?.recentPayments.slice(0, 2).map((payment) => (
            <Pressable
              key={payment.id}
              onPress={() => router.push('/payments')}
              style={styles.paymentRow}
            >
              <View style={styles.paymentIcon}>
                <Ionicons name="checkmark" size={20} color={colors.success} />
              </View>
              <View style={styles.paymentCopy}>
                <Text style={styles.rowTitle}>{payment.studentNames.join(', ')}</Text>
                <Text style={common.caption}>
                  {payment.reference} ·{' '}
                  {payment.paidAt
                    ? new Date(payment.paidAt).toLocaleDateString('fr-CM')
                    : 'En cours'}
                </Text>
              </View>
              <Money value={payment.amount} style={styles.paymentAmount} />
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function ChildRow({ child, delay }: { child: ChildSummary; delay: number }) {
  const due = child.balance?.balance ?? 0;
  return (
    <FadeIn delay={delay}>
      <Pressable
        testID={`child-${child.studentId}`}
        accessibilityLabel={`Ouvrir le dossier de ${child.firstName} ${child.lastName}`}
        onPress={() => router.push({ pathname: '/child/[id]', params: { id: child.studentId } })}
        style={({ pressed }) => [styles.childRow, pressed && styles.pressed]}
      >
        <View style={styles.avatar}>
          <Ionicons name="person-outline" size={22} color={colors.brand} />
        </View>
        <View style={styles.childCopy}>
          <Text style={styles.rowTitle}>
            {child.firstName} {child.lastName}
          </Text>
          <Text style={common.caption}>
            {child.schoolName} · {child.className ?? 'Classe non renseignée'}
          </Text>
        </View>
        <View style={styles.childBalance}>
          {child.balance ? (
            <>
              <Money value={due} style={[styles.childAmount, due <= 0 && styles.successText]} />
              <Text style={[common.caption, due <= 0 && styles.successText]}>
                {due > 0 ? 'à payer' : 'à jour'}
              </Text>
            </>
          ) : (
            <Text style={common.caption}>Masqué</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={19} color={colors.muted} />
      </Pressable>
    </FadeIn>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
    >
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={23} color={colors.brand} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 19, paddingBottom: 26 },
  topbar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    right: 5,
    top: 5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeText: { color: colors.surface, fontSize: 9, fontWeight: '900' },
  welcome: { marginTop: 4 },
  welcomeTitle: {
    color: colors.forest,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  balanceCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: 20,
  },
  balanceAccent: {
    position: 'absolute',
    left: 0,
    top: 18,
    width: 4,
    height: 62,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  balanceLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  balanceAmount: { marginTop: 7, color: colors.ink, fontSize: 32, lineHeight: 38 },
  balanceMeta: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  balanceMetaDivider: { width: 1, height: 32, backgroundColor: colors.line },
  balanceMetaLabel: { color: colors.muted, fontSize: 11 },
  balanceMetaValue: { marginTop: 3, color: colors.ink, fontSize: 13, fontWeight: '800' },
  childList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.brandSoft,
    overflow: 'hidden',
  },
  childRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  avatar: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childCopy: { flex: 1, gap: 3 },
  rowTitle: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  childBalance: { alignItems: 'flex-end' },
  childAmount: { color: colors.danger, fontSize: 14, lineHeight: 18 },
  successText: { color: colors.success },
  quickActions: {
    flexDirection: 'row',
    marginTop: 11,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  quickAction: {
    flex: 1,
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRightWidth: 1,
    borderRightColor: colors.line,
  },
  quickIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { color: colors.ink, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  recentSection: { gap: 9 },
  paymentRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    backgroundColor: colors.surface,
    paddingHorizontal: 13,
  },
  paymentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentCopy: { flex: 1, gap: 2 },
  paymentAmount: { fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.65 },
});
