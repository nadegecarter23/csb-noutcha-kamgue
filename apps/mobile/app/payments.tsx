import { Text } from '../src/typography';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api, cached, downloadReceipt } from '@/api';
import { colors, common, EmptyState, Money, Notice, PageHeader, Screen, StatusBadge } from '@/ui';

type Payment = {
  id: string;
  reference: string;
  amount: number;
  method: string;
  status: string;
  receiptId: string | null;
  studentNames: string[];
};
type External = {
  id: string;
  enrollmentId: string;
  studentName: string;
  amount: number;
  reference: string;
  status: string;
  rejectionReason: string | null;
  correctionMessage: string | null;
  paymentMethod: string;
  bankName: string | null;
  paymentDate: string;
  externalReference: string;
  notes: string | null;
};

const statusLabels: Record<string, string> = {
  SUCCESS: 'Crédité',
  COMPLETED: 'Crédité',
  PENDING: 'En attente',
  PENDING_REVIEW: 'À vérifier',
  REJECTED: 'Rejeté',
  FAILED: 'Échoué',
};
const statusTone = (status: string): 'success' | 'warning' | 'danger' | 'neutral' =>
  ['SUCCESS', 'COMPLETED', 'APPROVED'].includes(status)
    ? 'success'
    : ['REJECTED', 'FAILED'].includes(status)
      ? 'danger'
      : ['PENDING', 'PENDING_REVIEW'].includes(status)
        ? 'warning'
        : 'neutral';

export default function Payments() {
  const [data, setData] = useState<Payment[]>([]);
  const [external, setExternal] = useState<External[]>([]);
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState<'credited' | 'external'>('credited');
  useEffect(() => {
    void Promise.all([
      cached('parent.payments', () => api.get<Payment[]>('/parent/payments')).then((result) => {
        setData(result.data);
        setOffline(result.offline);
      }),
      api
        .get<External[]>('/parent/payments/external')
        .then(setExternal)
        .catch(() => undefined),
    ]);
  }, []);
  return (
    <Screen navigation>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader title="Paiements" subtitle="Historique clair de tous vos règlements." />
        {offline ? (
          <Notice tone="warning" icon="cloud-offline-outline">
            Historique disponible hors ligne.
          </Notice>
        ) : null}
        <View style={styles.tabs}>
          <Pressable
            onPress={() => setTab('credited')}
            style={[styles.tab, tab === 'credited' && styles.tabSelected]}
          >
            <Text style={[styles.tabText, tab === 'credited' && styles.tabTextSelected]}>
              Paiements crédités
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('external')}
            style={[styles.tab, tab === 'external' && styles.tabSelected]}
          >
            <Text style={[styles.tabText, tab === 'external' && styles.tabTextSelected]}>
              Déclarations externes
            </Text>
          </Pressable>
        </View>
        {tab === 'credited' ? (
          <View style={styles.list}>
            {data.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} />
            ))}
            {!data.length ? (
              <EmptyState
                icon="receipt-outline"
                title="Aucun paiement crédité"
                description="Vos règlements confirmés apparaîtront ici avec leur reçu."
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.list}>
            {external.map((item) => (
              <ExternalRow key={item.id} item={item} />
            ))}
            {!external.length ? (
              <EmptyState
                icon="document-attach-outline"
                title="Aucune déclaration externe"
                description="Les virements, dépôts et chèques déclarés apparaîtront ici."
              />
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function PaymentRow({ payment }: { payment: Payment }) {
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.statusIcon,
          {
            backgroundColor:
              statusTone(payment.status) === 'success' ? colors.successSoft : colors.brandSoft,
          },
        ]}
      >
        <Ionicons
          name={statusTone(payment.status) === 'success' ? 'checkmark' : 'time-outline'}
          size={22}
          color={statusTone(payment.status) === 'success' ? colors.success : colors.brand}
        />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{payment.studentNames.join(', ')}</Text>
        <Text style={common.caption}>{payment.reference}</Text>
        <Text style={styles.method}>{payment.method.replaceAll('_', ' ')}</Text>
      </View>
      <View style={styles.rowRight}>
        <Money value={payment.amount} style={styles.rowAmount} />
        <StatusBadge
          label={statusLabels[payment.status] ?? payment.status}
          tone={statusTone(payment.status)}
        />
        {payment.receiptId ? (
          <Pressable
            accessibilityLabel="Télécharger le reçu"
            onPress={() => void downloadReceipt(payment.receiptId as string)}
            style={styles.receipt}
          >
            <Ionicons name="download-outline" size={19} color={colors.brand} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ExternalRow({ item }: { item: External }) {
  const rejected = item.status === 'REJECTED';
  return (
    <View style={[styles.row, rejected && styles.rejectedRow]}>
      <View
        style={[
          styles.statusIcon,
          { backgroundColor: rejected ? colors.dangerSoft : colors.warningSoft },
        ]}
      >
        <Ionicons
          name={rejected ? 'close' : 'time-outline'}
          size={22}
          color={rejected ? colors.danger : colors.warning}
        />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{item.studentName}</Text>
        <Text style={common.caption}>{item.reference}</Text>
        <Text style={styles.method}>{item.paymentMethod.replaceAll('_', ' ')}</Text>
        {item.rejectionReason ? <Text style={styles.rejection}>{item.rejectionReason}</Text> : null}
        {item.correctionMessage ? (
          <Text style={styles.correction}>{item.correctionMessage}</Text>
        ) : null}
        {rejected ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/external-payment',
                params: {
                  enrollmentId: item.enrollmentId,
                  name: item.studentName,
                  balance: String(item.amount),
                  method: item.paymentMethod,
                  bankName: item.bankName ?? '',
                  paymentDate: item.paymentDate,
                  externalReference: item.externalReference,
                  notes: item.notes ?? '',
                },
              })
            }
            style={styles.correctButton}
          >
            <Ionicons name="create-outline" size={17} color={colors.brand} />
            <Text style={styles.correctText}>Corriger et renvoyer</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.rowRight}>
        <Money value={item.amount} style={styles.rowAmount} />
        <StatusBadge
          label={statusLabels[item.status] ?? item.status}
          tone={statusTone(item.status)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 15, paddingBottom: 28 },
  tabs: {
    minHeight: 50,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: 10,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  tabSelected: { backgroundColor: colors.brand },
  tabText: { color: colors.brand, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  tabTextSelected: { color: colors.surface },
  list: { gap: 10 },
  row: {
    minHeight: 100,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    backgroundColor: colors.surface,
    padding: 13,
  },
  rejectedRow: { borderColor: '#F0CCCC', backgroundColor: '#FFFBFB' },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  method: { color: colors.brand, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  rowAmount: { fontSize: 13, lineHeight: 18 },
  receipt: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejection: { marginTop: 4, color: colors.danger, fontSize: 12, lineHeight: 17 },
  correction: { color: colors.warning, fontSize: 12, lineHeight: 17 },
  correctButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5 },
  correctText: { color: colors.brand, fontSize: 12, fontWeight: '700' },
});
