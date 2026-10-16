import { Text } from '../src/typography';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api } from '@/api';
import { Button, colors, common, EmptyState, Money, PageHeader, Screen, StatusBadge } from '@/ui';

type Dashboard = {
  children: Array<{
    studentId: string;
    firstName: string;
    lastName: string;
    schoolName: string;
    className: string | null;
    canViewFinances: boolean;
    balance: { totalDue: number; totalPaid: number; balance: number } | null;
    nextInstallment: { label: string; amount: number; dueDate: string } | null;
  }>;
};

export default function ChildrenScreen() {
  const [children, setChildren] = useState<Dashboard['children']>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void api
      .get<Dashboard>('/parent/dashboard')
      .then((data) => setChildren(data.children))
      .finally(() => setLoading(false));
  }, []);
  return (
    <Screen navigation>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader
          title="Mes enfants"
          subtitle="Dossiers scolaires et situation des frais."
          action={
            <Pressable onPress={() => router.push('/add-child')} style={styles.addButton}>
              <Ionicons name="add" size={23} color={colors.surface} />
            </Pressable>
          }
        />
        {children.map((child) => {
          const due = child.balance?.balance ?? 0;
          return (
            <Pressable
              key={child.studentId}
              onPress={() =>
                router.push({ pathname: '/child/[id]', params: { id: child.studentId } })
              }
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.cardTop}>
                <View style={styles.avatar}>
                  <Text style={styles.initials}>
                    {child.firstName[0]}
                    {child.lastName[0]}
                  </Text>
                </View>
                <View style={styles.copy}>
                  <Text style={styles.name}>
                    {child.firstName} {child.lastName}
                  </Text>
                  <Text style={common.caption}>{child.schoolName}</Text>
                  <Text style={styles.className}>{child.className ?? 'Classe non renseignée'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={21} color={colors.muted} />
              </View>
              <View style={styles.financeRow}>
                <View>
                  <Text style={common.caption}>Reste à payer</Text>
                  {child.balance ? (
                    <Money value={due} style={[styles.amount, due <= 0 && styles.success]} />
                  ) : (
                    <Text style={common.caption}>Non autorisé</Text>
                  )}
                </View>
                {child.nextInstallment && due > 0 ? (
                  <View style={styles.installment}>
                    <Text style={common.caption}>Prochaine échéance</Text>
                    <Text style={styles.installmentText}>{child.nextInstallment.label}</Text>
                  </View>
                ) : (
                  <StatusBadge
                    label={due > 0 ? 'À régulariser' : 'À jour'}
                    tone={due > 0 ? 'warning' : 'success'}
                  />
                )}
              </View>
            </Pressable>
          );
        })}
        {!loading && !children.length ? (
          <EmptyState
            icon="people-outline"
            title="Aucun enfant associé"
            description="Ajoutez un enfant à partir du QR code ou du code remis par le collège."
            actionLabel="Associer un enfant"
            onAction={() => router.push('/add-child')}
          />
        ) : null}
        {children.length ? (
          <Button
            label="Associer un autre enfant"
            icon="person-add-outline"
            variant="secondary"
            onPress={() => router.push('/add-child')}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 28 },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardTop: { minHeight: 91, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: colors.surface, fontSize: 17, fontWeight: '900' },
  copy: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '800' },
  className: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  financeRow: {
    minHeight: 69,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.background,
    paddingHorizontal: 15,
  },
  amount: { color: colors.danger, fontSize: 16, lineHeight: 21 },
  success: { color: colors.success },
  installment: { alignItems: 'flex-end' },
  installmentText: { color: colors.warning, fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.66 },
});
