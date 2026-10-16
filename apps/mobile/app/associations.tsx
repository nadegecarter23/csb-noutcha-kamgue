import { Text } from '../src/typography';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api } from '@/api';
import { Button, colors, common, EmptyState, Notice, PageHeader, Screen } from '@/ui';

type Link = {
  id: string;
  firstName: string;
  lastName: string;
  schoolName: string;
  className: string | null;
  maskedStudentNumber: string;
};

export default function Associations() {
  const [links, setLinks] = useState<Link[]>([]);
  const [error, setError] = useState('');
  const load = () =>
    api
      .get<Link[]>('/parent/pending-links')
      .then(setLinks)
      .catch((cause: Error) => setError(cause.message));
  useEffect(() => {
    void load();
  }, []);
  const decide = async (id: string, action: 'accept' | 'reject') => {
    await api.post(`/parent/links/${id}/${action}`);
    await load();
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader
          title="Enfants détectés"
          subtitle="Confirmez uniquement les dossiers de vos propres enfants."
        />
        <Notice icon="shield-checkmark-outline">
          Les rapprochements utilisent votre numéro vérifié. Aucune information financière n’est
          partagée avant votre confirmation.
        </Notice>
        {links.map((link) => (
          <View key={link.id} style={styles.card}>
            <View style={styles.studentTop}>
              <View style={styles.avatar}>
                <Ionicons name="person-outline" size={25} color={colors.brand} />
              </View>
              <View style={styles.studentCopy}>
                <Text style={styles.name}>
                  {link.firstName} {link.lastName}
                </Text>
                <Text style={common.caption}>
                  {link.schoolName} · {link.className ?? 'Classe inconnue'}
                </Text>
                <Text style={styles.matricule}>{link.maskedStudentNumber}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Button
                label="C’est mon enfant"
                icon="checkmark"
                onPress={() => void decide(link.id, 'accept')}
                style={styles.flex}
              />
              <Pressable onPress={() => void decide(link.id, 'reject')} style={styles.reject}>
                <Ionicons name="close" size={19} color={colors.danger} />
                <Text style={styles.rejectText}>Refuser</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {!links.length ? (
          <EmptyState
            icon="checkmark-circle-outline"
            title="Aucune proposition"
            description="Vous pourrez toujours associer un enfant avec le code remis par l’établissement."
          />
        ) : null}
        {error ? (
          <Notice tone="danger" icon="alert-circle-outline">
            {error}
          </Notice>
        ) : null}
        <Button
          label="Continuer vers mon espace"
          icon="arrow-forward"
          onPress={() => router.replace('/home')}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 28 },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
    backgroundColor: colors.surface,
    padding: 15,
    gap: 15,
  },
  studentTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentCopy: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  matricule: { color: colors.brand, fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  reject: {
    minHeight: 54,
    minWidth: 100,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F2CACA',
    backgroundColor: colors.dangerSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  rejectText: { color: colors.danger, fontWeight: '700' },
});
