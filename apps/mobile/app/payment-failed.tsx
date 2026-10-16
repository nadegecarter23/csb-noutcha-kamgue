import { Text } from '../src/typography';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, colors, common, Notice, Screen } from '@/ui';

export default function Failed() {
  const { confirmed, reason } = useLocalSearchParams<{ confirmed: string; reason: string }>();
  const certain = confirmed === 'true';
  return (
    <Screen backgroundColor={colors.surface}>
      <View style={styles.content}>
        <View style={[styles.icon, !certain && styles.iconWarning]}>
          <Ionicons
            name={certain ? 'close' : 'time-outline'}
            size={42}
            color={certain ? colors.danger : colors.warning}
          />
        </View>
        <Text style={[styles.title, { color: certain ? colors.danger : colors.warning }]}>
          {certain ? 'Paiement non abouti' : 'Paiement en vérification'}
        </Text>
        <Text style={styles.description}>
          {certain
            ? 'L’opérateur confirme qu’aucun débit n’a été effectué. Vous pouvez réessayer en toute sécurité.'
            : 'Le statut reste incertain. Ne relancez pas immédiatement le paiement : le CSB Noutcha KAMGUE poursuit la vérification.'}
        </Text>
        {reason ? (
          <Notice tone={certain ? 'danger' : 'warning'} icon="information-circle-outline">
            {reason}
          </Notice>
        ) : null}
        <View style={styles.assurance}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.brand} />
          <View style={styles.assuranceCopy}>
            <Text style={styles.assuranceTitle}>Votre argent reste traçable</Text>
            <Text style={common.caption}>
              {certain
                ? 'Aucun reçu ni débit n’a été enregistré.'
                : 'La transaction sera rapprochée avant toute nouvelle action.'}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        <Button label="Retour à l’accueil" onPress={() => router.replace('/home')} />
        {certain ? (
          <Button
            label="Consulter mes paiements"
            variant="secondary"
            onPress={() => router.replace('/payments')}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15 },
  icon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWarning: { backgroundColor: colors.warningSoft },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '900', textAlign: 'center' },
  description: {
    maxWidth: 335,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  assurance: {
    width: '100%',
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    backgroundColor: colors.background,
    padding: 14,
  },
  assuranceCopy: { flex: 1 },
  assuranceTitle: { color: colors.ink, fontSize: 14, fontWeight: '800', marginBottom: 3 },
  actions: { gap: 11, paddingBottom: 8 },
});
