import { Text } from '../src/typography';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api, cached } from '@/api';
import { colors, EmptyState, PageHeader, Screen, SectionHeader } from '@/ui';

type Notification = {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};
type Page = { data: Notification[] };

export default function Notifications() {
  const [data, setData] = useState<Notification[]>([]);
  const load = () =>
    cached('parent.notifications', () => api.get<Page>('/parent/notifications?page=1')).then(
      (result) => setData(result.data.data),
    );
  useEffect(() => {
    void load();
  }, []);
  const unread = data.filter((item) => !item.readAt);
  const read = data.filter((item) => item.readAt);
  const open = async (notification: Notification) => {
    await api.post(`/parent/notifications/${notification.id}/read`);
    if (notification.data.screen === 'external-payment') router.push('/payments');
    else if (notification.data.screen === 'family-balance') router.push('/home');
    await load();
  };
  const markAll = async () => {
    await api.post('/parent/notifications/read-all');
    await load();
  };
  return (
    <Screen navigation>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader
          title="Notifications"
          subtitle="Messages du collège et suivi de vos paiements."
          back
          action={
            unread.length ? (
              <Pressable onPress={() => void markAll()} style={styles.markAll}>
                <Text style={styles.markAllText}>Tout lire</Text>
              </Pressable>
            ) : undefined
          }
        />
        {unread.length ? (
          <View style={styles.section}>
            <SectionHeader title="Non lues" />
            {unread.map((item) => (
              <NotificationRow key={item.id} item={item} onPress={() => void open(item)} />
            ))}
          </View>
        ) : null}
        {read.length ? (
          <View style={styles.section}>
            <SectionHeader title="Lues" />
            {read.map((item) => (
              <NotificationRow key={item.id} item={item} onPress={() => void open(item)} />
            ))}
          </View>
        ) : null}
        {!data.length ? (
          <EmptyState
            icon="notifications-outline"
            title="Aucune notification"
            description="Les annonces du collège, rappels et confirmations de paiement apparaîtront ici."
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function NotificationRow({ item, onPress }: { item: Notification; onPress: () => void }) {
  const unread = !item.readAt;
  const payment = /paiement|reçu|solde/i.test(`${item.title} ${item.body}`);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.pressed]}
    >
      <View style={[styles.icon, unread && styles.iconUnread]}>
        <Ionicons
          name={payment ? 'card-outline' : 'notifications-outline'}
          size={21}
          color={unread ? colors.surface : colors.brand}
        />
      </View>
      {unread ? <View style={styles.unreadDot} /> : null}
      <View style={styles.copy}>
        <Text style={[styles.title, unread && styles.titleUnread]}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>
        <Text style={styles.date}>{new Date(item.createdAt).toLocaleString('fr-CM')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingBottom: 28 },
  markAll: { minHeight: 44, justifyContent: 'center' },
  markAllText: { color: colors.brand, fontSize: 12, fontWeight: '800' },
  section: { gap: 9 },
  row: {
    minHeight: 98,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    backgroundColor: colors.surface,
    padding: 13,
  },
  rowUnread: { borderColor: '#d4e9df', backgroundColor: '#f3f8f4' },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.brand },
  unreadDot: {
    position: 'absolute',
    left: 7,
    top: 17,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  copy: { flex: 1 },
  title: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  titleUnread: { color: colors.forest, fontWeight: '900' },
  body: { marginTop: 3, color: colors.muted, fontSize: 13, lineHeight: 18 },
  date: { marginTop: 6, color: '#6e8279', fontSize: 11 },
  pressed: { opacity: 0.65 },
});
