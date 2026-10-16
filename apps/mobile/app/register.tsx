import { TextInput, Text } from '../src/typography';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { MobileApiError, request } from '@/api';
import { Button, colors, common, Field, Notice, PageHeader, Screen } from '@/ui';

export default function RegisterScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (password !== confirmation) return setError('Les mots de passe ne correspondent pas.');
    setBusy(true);
    setError('');
    try {
      const result = await request<{ phone: string }>('/auth/register', {
        firstName,
        lastName,
        phone,
        email: email || undefined,
        password,
        acceptTerms: accepted,
      });
      await request('/auth/otp/send', { phone: result.phone, purpose: 'SIGNUP' });
      router.push({ pathname: '/verify', params: { phone: result.phone } });
    } catch (cause) {
      setError(cause instanceof MobileApiError ? cause.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  const strength =
    password.length >= 12 ? 'Fort' : password.length >= 8 ? 'Correct' : '8 caractères minimum';
  const strengthTone =
    password.length >= 12 ? colors.success : password.length >= 8 ? colors.warning : colors.muted;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <PageHeader
            title="Créer un compte"
            subtitle="Quelques informations suffisent pour commencer."
            back
          />
          <View style={styles.form}>
            <View style={styles.nameRow}>
              <View style={styles.nameField}>
                <Field label="Prénom">
                  <TextInput
                    style={common.input}
                    value={firstName}
                    onChangeText={setFirstName}
                    autoComplete="given-name"
                  />
                </Field>
              </View>
              <View style={styles.nameField}>
                <Field label="Nom">
                  <TextInput
                    style={common.input}
                    value={lastName}
                    onChangeText={setLastName}
                    autoComplete="family-name"
                  />
                </Field>
              </View>
            </View>
            <Field label="Téléphone">
              <TextInput
                style={common.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="+237 6XX XX XX XX"
                placeholderTextColor="#73877f"
              />
            </Field>
            <Field label="E-mail" hint="Facultatif — utile pour recevoir vos reçus.">
              <TextInput
                style={common.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </Field>
            <Field label="Mot de passe">
              <TextInput
                style={common.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              <View style={styles.strengthRow}>
                <View style={styles.strengthTrack}>
                  <View
                    style={[
                      styles.strengthFill,
                      {
                        width:
                          password.length >= 12 ? '100%' : password.length >= 8 ? '66%' : '25%',
                        backgroundColor: strengthTone,
                      },
                    ]}
                  />
                </View>
                <Text style={[common.caption, { color: strengthTone }]}>{strength}</Text>
              </View>
            </Field>
            <Field label="Confirmer le mot de passe">
              <TextInput
                style={common.input}
                value={confirmation}
                onChangeText={setConfirmation}
                secureTextEntry
              />
            </Field>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted }}
              onPress={() => setAccepted((value) => !value)}
              style={styles.terms}
            >
              <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
                {accepted ? <Ionicons name="checkmark" size={17} color={colors.surface} /> : null}
              </View>
              <Text style={styles.termsText}>
                J’accepte les conditions d’utilisation et la politique de confidentialité.
              </Text>
            </Pressable>
            {error ? (
              <Notice tone="danger" icon="alert-circle-outline">
                {error}
              </Notice>
            ) : null}
            <Button
              label={busy ? 'Création…' : 'Continuer'}
              icon="arrow-forward"
              disabled={
                busy || !accepted || password.length < 8 || !firstName || !lastName || !phone
              }
              onPress={() => void submit()}
            />
            <Pressable style={common.link} onPress={() => router.push('/login')}>
              <Text style={common.linkText}>J’ai déjà un compte</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 20, paddingBottom: 30 },
  form: { gap: 17 },
  nameRow: { flexDirection: 'row', gap: 12 },
  nameField: { flex: 1 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  strengthTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  strengthFill: { height: 5, borderRadius: 3 },
  terms: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 11 },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1.5,
    borderColor: '#8ba598',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: { borderColor: colors.brand, backgroundColor: colors.brand },
  termsText: { flex: 1, color: '#3e574c', fontSize: 14, lineHeight: 20 },
});
