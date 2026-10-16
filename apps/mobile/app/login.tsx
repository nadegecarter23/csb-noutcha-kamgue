import { TextInput, Text } from '../src/typography';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { MobileApiError, request, saveTokens } from '@/api';
import { BrandMark, Button, colors, common, Field, PageHeader, Screen } from '@/ui';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);

  async function login() {
    setBusy(true);
    setError('');
    try {
      const session = await request<{ tokens: { accessToken: string; refreshToken: string } }>(
        '/auth/login',
        {
          identifier: phone,
          password,
          deviceLabel: 'Application mobile',
        },
      );
      await saveTokens(session.tokens);
      router.replace('/associations');
    } catch (cause) {
      setError(cause instanceof MobileApiError ? cause.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen backgroundColor={colors.background}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageHeader
          title="Se connecter"
          subtitle="Retrouvez votre espace parent CSB Noutcha KAMGUE."
          back
        />
        <View style={styles.brand}>
          <BrandMark />
        </View>
        <View style={styles.form}>
          <Field label="Numéro de téléphone">
            <View style={styles.inputWrap}>
              <View style={styles.country}>
                <Text style={styles.flag}>🇨🇲</Text>
                <Text style={styles.countryText}>+237</Text>
              </View>
              <TextInput
                testID="login-phone"
                accessibilityLabel="Numéro de téléphone"
                style={styles.inputInner}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="6 12 34 56 78"
                placeholderTextColor="#73877f"
                autoComplete="tel"
              />
            </View>
          </Field>
          <Field label="Mot de passe">
            <View style={styles.inputWrap}>
              <TextInput
                testID="login-password"
                accessibilityLabel="Mot de passe"
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!visible}
                autoComplete="password"
              />
              <Pressable
                accessibilityLabel={
                  visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                }
                onPress={() => setVisible((value) => !value)}
                style={styles.eye}
              >
                <Ionicons
                  name={visible ? 'eye-off-outline' : 'eye-outline'}
                  size={21}
                  color={colors.muted}
                />
              </Pressable>
            </View>
          </Field>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={19} color={colors.danger} />
              <Text style={[common.error, styles.errorText]}>{error}</Text>
            </View>
          ) : null}
          <Button
            label={busy ? 'Connexion…' : 'Se connecter'}
            icon="log-in-outline"
            disabled={busy || !phone || !password}
            onPress={() => void login()}
          />
        </View>
        <View style={styles.createRow}>
          <Text style={common.caption}>Vous n’avez pas encore de compte ?</Text>
          <Pressable onPress={() => router.push('/register')}>
            <Text style={common.linkText}>Créer un compte</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingBottom: 24 },
  brand: { marginTop: 22 },
  form: { marginTop: 34, gap: 18 },
  inputWrap: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cadbd2',
    borderRadius: 11,
    backgroundColor: colors.surface,
  },
  country: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRightWidth: 1,
    borderRightColor: colors.line,
    paddingHorizontal: 12,
  },
  flag: { fontSize: 18 },
  countryText: { color: colors.ink, fontWeight: '700' },
  inputInner: { flex: 1, minHeight: 52, paddingHorizontal: 13, color: colors.ink, fontSize: 16 },
  passwordInput: { flex: 1, minHeight: 52, paddingLeft: 15, color: colors.ink, fontSize: 16 },
  eye: { width: 50, height: 52, alignItems: 'center', justifyContent: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    backgroundColor: colors.dangerSoft,
    padding: 12,
  },
  errorText: { flex: 1 },
  createRow: { marginTop: 'auto', alignItems: 'center', gap: 8, paddingTop: 40 },
});
