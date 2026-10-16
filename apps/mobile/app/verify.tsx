import { TextInput, Text } from '../src/typography';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput as NativeTextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { MobileApiError, request, saveTokens } from '@/api';
import { Button, colors, common, Notice, PageHeader, Screen } from '@/ui';

export default function VerifyScreen() {
  const { phone = '' } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [remaining, setRemaining] = useState(60);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<NativeTextInput>(null);

  useEffect(() => {
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function verify() {
    setBusy(true);
    setError('');
    try {
      const session = await request<{ tokens: { accessToken: string; refreshToken: string } }>(
        '/auth/otp/verify',
        { phone, purpose: 'SIGNUP', code },
      );
      await saveTokens(session.tokens);
      router.replace('/associations');
    } catch (cause) {
      setError(cause instanceof MobileApiError ? cause.message : 'Vérification impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      await request('/auth/otp/send', { phone, purpose: 'SIGNUP' });
      setRemaining(60);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Envoi impossible.');
    }
  }

  return (
    <Screen backgroundColor={colors.surface}>
      <PageHeader title="Vérifiez votre numéro" back />
      <View style={styles.content}>
        <View style={styles.icon}>
          <Ionicons name="chatbubble-ellipses-outline" size={32} color={colors.brand} />
        </View>
        <Text style={styles.explanation}>Entrez le code à 6 chiffres envoyé au</Text>
        <Text style={styles.phone}>{phone}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Saisir le code reçu"
          onPress={() => input.current?.focus()}
          style={styles.codeRow}
        >
          {Array.from({ length: 6 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.codeBox,
                code[index] && styles.codeBoxFilled,
                index === code.length && styles.codeBoxActive,
              ]}
            >
              <Text style={styles.codeText}>{code[index] ?? ''}</Text>
            </View>
          ))}
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          style={styles.hiddenInput}
          autoFocus
        />
        {error ? (
          <Notice tone="danger" icon="alert-circle-outline">
            {error}
          </Notice>
        ) : null}
        <View style={styles.resend}>
          <Text style={common.caption}>Vous n’avez pas reçu le code ?</Text>
          <Text style={styles.timer}>
            {remaining > 0 ? `00:${String(remaining).padStart(2, '0')}` : 'Vous pouvez le renvoyer'}
          </Text>
          <Pressable disabled={remaining > 0} onPress={() => void resend()} style={common.link}>
            <Text style={[common.linkText, remaining > 0 && styles.disabled]}>
              Renvoyer le code
            </Text>
          </Pressable>
        </View>
      </View>
      <Button
        label={busy ? 'Vérification…' : 'Vérifier'}
        icon="shield-checkmark-outline"
        disabled={busy || code.length !== 6}
        onPress={() => void verify()}
        style={styles.button}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', paddingTop: 50 },
  icon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  explanation: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  phone: { marginTop: 5, color: colors.brand, fontSize: 17, lineHeight: 23, fontWeight: '800' },
  codeRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginTop: 34 },
  codeBox: {
    width: 46,
    height: 58,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  codeBoxFilled: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  codeBoxActive: { borderColor: colors.brand },
  codeText: { color: colors.forest, fontSize: 23, fontWeight: '800' },
  hiddenInput: { position: 'absolute', opacity: 0 },
  resend: { alignItems: 'center', marginTop: 82 },
  timer: {
    marginTop: 8,
    color: colors.brand,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  disabled: { color: '#8ba598' },
  button: { marginBottom: 10 },
});
