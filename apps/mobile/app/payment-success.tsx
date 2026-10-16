import { Text } from '../src/typography';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { downloadReceipt } from '@/api';
import { BrandMark, Button, colors, common, Money, Screen } from '@/ui';

export default function Success() {
  const { id, receiptId, amount, balance } = useLocalSearchParams<{
    id: string;
    receiptId: string;
    amount: string;
    balance: string;
  }>();
  return (
    <Screen backgroundColor={colors.surface}>
      <BrandMark />
      <View style={styles.content}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={48} color={colors.surface} />
        </View>
        <Text style={styles.title}>Paiement confirmé</Text>
        <Text style={styles.thanks}>Merci, votre règlement a été enregistré avec succès.</Text>
        <View style={styles.amountCard}>
          <Text style={common.caption}>Montant payé</Text>
          <Money value={Number(amount)} style={styles.amount} />
          <View style={styles.reference}>
            <View style={styles.referenceCopy}>
              <Text style={common.caption}>Référence de transaction</Text>
              <Text selectable style={styles.referenceValue}>
                {id}
              </Text>
            </View>
            <Ionicons name="document-text-outline" size={20} color={colors.brand} />
          </View>
        </View>
        <View style={styles.balanceCard}>
          <View>
            <Text style={common.caption}>Reste à payer</Text>
            <Text style={styles.balanceNote}>Situation mise à jour après ce paiement</Text>
          </View>
          <Money value={Number(balance)} style={styles.balanceAmount} />
        </View>
      </View>
      <View style={styles.actions}>
        {receiptId ? (
          <Button
            label="Télécharger le reçu"
            icon="download-outline"
            onPress={() => void downloadReceipt(receiptId)}
          />
        ) : null}
        <Button
          label="Retour à l’accueil"
          variant="secondary"
          onPress={() => router.replace('/home')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  successIcon: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select<ViewStyle>({
      web: { boxShadow: '0 8px 20px rgba(8, 122, 67, 0.18)' },
      default: {
        shadowColor: colors.success,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: 4,
      },
    }),
  },
  title: {
    marginTop: 23,
    color: colors.success,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    textAlign: 'center',
  },
  thanks: {
    marginTop: 8,
    maxWidth: 310,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  amountCard: {
    width: '100%',
    marginTop: 28,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 16,
    alignItems: 'center',
  },
  amount: { marginTop: 5, color: colors.success, fontSize: 30, lineHeight: 36 },
  reference: {
    width: '100%',
    minHeight: 62,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
  },
  referenceCopy: { flex: 1 },
  referenceValue: { marginTop: 3, color: colors.ink, fontSize: 12, fontWeight: '800' },
  balanceCard: {
    width: '100%',
    minHeight: 82,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#B9DFC9',
    borderRadius: 13,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 15,
  },
  balanceNote: { marginTop: 3, color: colors.success, fontSize: 11 },
  balanceAmount: { color: colors.success, fontSize: 17, lineHeight: 23 },
  actions: { gap: 11, paddingBottom: 8 },
});
