import { Text } from '../src/typography';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getCurrentPayment, restoreSession } from '@/api';
import { BrandMark, Button, colors, common, FadeIn, Screen } from '@/ui';

export default function WelcomeScreen() {
  useEffect(() => {
    void restoreSession().then(async (active) => {
      if (!active) return;
      const payment = await getCurrentPayment();
      router.replace(
        payment && ['PROCESSING', 'PENDING_INVESTIGATION'].includes(payment.status)
          ? { pathname: '/payment-waiting', params: { id: payment.id } }
          : '/home',
      );
    });
  }, []);

  return (
    <Screen backgroundColor={colors.background}>
      <View style={styles.container}>
        <FadeIn>
          <BrandMark />
        </FadeIn>
        <FadeIn delay={80} style={styles.hero}>
          <View style={styles.schoolIcon}>
            <Ionicons name="school-outline" size={42} color={colors.accent} />
          </View>
          <Text style={styles.title}>Bienvenue au CSB Noutcha KAMGUE</Text>
          <View style={styles.goldRule} />
          <Text style={styles.tagline}>La scolarité de vos enfants, simplement.</Text>
          <Text style={styles.description}>
            Suivez les frais de scolarité, consultez les paiements et restez informé, où que vous
            soyez.
          </Text>
        </FadeIn>
        <FadeIn delay={160} style={styles.actions}>
          <Button
            label="Créer un compte"
            icon="person-add-outline"
            onPress={() => router.push('/register')}
          />
          <Button label="Se connecter" variant="secondary" onPress={() => router.push('/login')} />
          <Pressable style={styles.schoolFooter} accessibilityRole="text">
            <View style={styles.goldDot} />
            <Text style={common.caption}>CSB Noutcha KAMGUE · Dogpassi</Text>
          </Pressable>
        </FadeIn>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', paddingTop: 12, paddingBottom: 8 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  schoolIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: {
    color: colors.forest,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  goldRule: {
    width: 42,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginTop: 15,
  },
  tagline: {
    marginTop: 22,
    color: colors.ink,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    marginTop: 12,
    maxWidth: 330,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  actions: { gap: 12 },
  schoolFooter: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  goldDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
});
