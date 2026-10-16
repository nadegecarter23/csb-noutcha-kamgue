import { Text } from '../../src/typography';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { api, cached } from '@/api';
import {
  Button,
  colors,
  common,
  Money,
  Notice,
  PageHeader,
  Screen,
  SectionHeader,
  StatusBadge,
} from '@/ui';

type Balance = { totalDue: number; totalPaid: number; balance: number };
type Child = {
  firstName: string;
  lastName: string;
  studentNumber: string;
  schoolName: string;
  className: string | null;
  canViewFinances: boolean;
  canPay: boolean;
  balance: Balance | null;
  enrollments: Array<{
    id: string;
    academicYear: string;
    className: string | null;
    isCurrent: boolean;
    balance: Balance;
  }>;
};
type Statement = {
  balance: { balance: number };
  fees: Array<{ id: string; name: string; paidAmount: number; finalAmount: number }>;
};

export default function ChildDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Child>();
  const [statement, setStatement] = useState<Statement>();
  const [selectedEnrollment, setSelectedEnrollment] = useState<string>();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    void cached(`parent.child.${id}`, () => api.get<Child>(`/parent/children/${id}`)).then(
      (result) => {
        setData(result.data);
        setOffline(result.offline);
        const current = result.data.enrollments.find((item) => item.isCurrent);
        if (current && result.data.canViewFinances) {
          setSelectedEnrollment(current.id);
          void api.get<Statement>(`/parent/enrollments/${current.id}/statement`).then(setStatement);
        }
      },
    );
  }, [id]);
  const selectEnrollment = (enrollmentId: string) => {
    setSelectedEnrollment(enrollmentId);
    void api.get<Statement>(`/parent/enrollments/${enrollmentId}/statement`).then(setStatement);
  };
  const current = data?.enrollments.find((item) => item.isCurrent);

  return (
    <Screen navigation>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader title="Détail de l’enfant" back />
        {offline ? (
          <Notice tone="warning" icon="cloud-offline-outline">
            Consultation hors ligne · les dernières données disponibles sont affichées.
          </Notice>
        ) : null}
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Ionicons name="person-outline" size={31} color={colors.forest} />
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.name}>
              {data?.firstName} {data?.lastName}
            </Text>
            <Text style={styles.school}>{data?.schoolName}</Text>
            <Text style={styles.className}>{data?.className ?? 'Classe non renseignée'}</Text>
            <Text style={styles.matricule}>Matricule : {data?.studentNumber ?? '—'}</Text>
          </View>
        </View>
        {data?.balance ? (
          <View style={styles.summary}>
            <SummaryItem label="Total dû" value={data.balance.totalDue} />
            <View style={styles.summaryDivider} />
            <SummaryItem label="Total payé" value={data.balance.totalPaid} tone="success" />
            <View style={styles.summaryDivider} />
            <SummaryItem
              label="Reste à payer"
              value={data.balance.balance}
              tone={data.balance.balance > 0 ? 'danger' : 'success'}
            />
          </View>
        ) : null}
        {!data?.canViewFinances ? (
          <Notice icon="eye-off-outline">
            La consultation financière de ce dossier n’est pas autorisée.
          </Notice>
        ) : null}
        <SectionHeader title="Historique des inscriptions" />
        <View style={styles.enrollmentList}>
          {data?.enrollments.map((enrollment) => (
            <Pressable
              key={enrollment.id}
              disabled={!data.canViewFinances}
              onPress={() => selectEnrollment(enrollment.id)}
              style={[
                styles.enrollmentRow,
                selectedEnrollment === enrollment.id && styles.enrollmentSelected,
              ]}
            >
              <View style={styles.calendar}>
                <Ionicons name="calendar-outline" size={21} color={colors.brand} />
              </View>
              <View style={styles.enrollmentCopy}>
                <View style={styles.enrollmentTitle}>
                  <Text style={styles.year}>{enrollment.academicYear}</Text>
                  {enrollment.isCurrent ? <StatusBadge label="Actuelle" tone="success" /> : null}
                </View>
                <Text style={common.caption}>{enrollment.className ?? 'Classe inconnue'}</Text>
              </View>
              <View style={styles.enrollmentBalance}>
                <Text style={common.caption}>Solde</Text>
                <Money value={enrollment.balance.balance} style={styles.smallMoney} />
              </View>
            </Pressable>
          ))}
        </View>
        {statement ? (
          <View style={styles.statement}>
            <View style={styles.statementHeader}>
              <Text style={common.sectionTitle}>Détail des frais</Text>
              <StatusBadge
                label={statement.balance.balance > 0 ? 'Paiement attendu' : 'À jour'}
                tone={statement.balance.balance > 0 ? 'warning' : 'success'}
              />
            </View>
            {statement.fees.map((fee) => {
              const remaining = Math.max(0, fee.finalAmount - fee.paidAmount);
              const progress =
                fee.finalAmount > 0 ? Math.min(100, (fee.paidAmount / fee.finalAmount) * 100) : 0;
              return (
                <View key={fee.id} style={styles.feeRow}>
                  <View style={styles.feeTop}>
                    <View style={styles.feeCopy}>
                      <Text style={styles.feeName}>{fee.name}</Text>
                      <Text style={[common.caption, remaining <= 0 && styles.successText]}>
                        {remaining > 0
                          ? `Reste ${remaining.toLocaleString('fr-CM')} FCFA`
                          : 'Payé intégralement'}
                      </Text>
                    </View>
                    <Text style={styles.feeAmount}>
                      {fee.paidAmount.toLocaleString('fr-CM')} /{' '}
                      {fee.finalAmount.toLocaleString('fr-CM')} FCFA
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
        {data?.canPay && data.balance && data.balance.balance > 0 && current ? (
          <View style={styles.actions}>
            <Button
              label="Payer les frais"
              icon="card-outline"
              onPress={() =>
                router.push({
                  pathname: '/pay/[id]',
                  params: {
                    id,
                    enrollmentId: current.id,
                    balance: String(current.balance.balance),
                    name: `${data.firstName} ${data.lastName}`,
                  },
                })
              }
            />
            <Button
              label="Déclarer un autre paiement"
              icon="document-attach-outline"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/external-payment',
                  params: {
                    enrollmentId: current.id,
                    balance: String(current.balance.balance),
                    name: `${data.firstName} ${data.lastName}`,
                  },
                })
              }
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SummaryItem({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'danger';
}) {
  return (
    <View style={styles.summaryItem}>
      <Text style={common.caption}>{label}</Text>
      <Money
        value={value}
        style={[
          styles.summaryMoney,
          tone === 'success' && styles.successText,
          tone === 'danger' && styles.dangerText,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 30 },
  identityCard: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    borderRadius: 16,
    backgroundColor: colors.forest,
    padding: 18,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCopy: { flex: 1 },
  name: { color: colors.surface, fontSize: 22, lineHeight: 27, fontWeight: '900' },
  school: { marginTop: 5, color: '#d4e9df', fontSize: 14, fontWeight: '700' },
  className: { marginTop: 2, color: colors.surface, fontSize: 14, fontWeight: '800' },
  matricule: { marginTop: 6, color: '#b4d6c6', fontSize: 11 },
  summary: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    paddingVertical: 13,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  summaryDivider: { width: 1, height: 48, backgroundColor: colors.line },
  summaryMoney: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  successText: { color: colors.success },
  dangerText: { color: colors.danger },
  enrollmentList: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  enrollmentRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingHorizontal: 13,
  },
  enrollmentSelected: { backgroundColor: colors.brandSoft },
  calendar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enrollmentCopy: { flex: 1, gap: 3 },
  enrollmentTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  year: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  enrollmentBalance: { alignItems: 'flex-end' },
  smallMoney: { fontSize: 12, lineHeight: 17 },
  statement: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 15,
  },
  statementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  feeRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 8 },
  feeTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  feeCopy: { flex: 1 },
  feeName: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  feeAmount: { color: colors.ink, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: '#e7f3ed', overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: colors.success },
  actions: { gap: 11 },
});
