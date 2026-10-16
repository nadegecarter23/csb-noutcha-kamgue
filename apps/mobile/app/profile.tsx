import { TextInput, Text } from '../src/typography';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api, clearTokens } from '@/api';
import {
  BrandMark,
  Button,
  colors,
  common,
  Field,
  Notice,
  PageHeader,
  Screen,
  SectionHeader,
  StatusBadge,
} from '@/ui';

type Device = {
  id: string;
  platform: string;
  deviceLabel: string | null;
  status: string;
  lastSeenAt: string;
};
type Preferences = {
  pushEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  paymentEnabled: boolean;
  reminderEnabled: boolean;
  newsEnabled: boolean;
};
const prefLabels: Record<
  keyof Preferences,
  { label: string; description: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  pushEnabled: {
    label: 'Notifications push',
    description: 'Alertes directement sur cet appareil',
    icon: 'notifications-outline',
  },
  smsEnabled: {
    label: 'SMS',
    description: 'Messages sur votre numéro vérifié',
    icon: 'chatbubble-outline',
  },
  emailEnabled: {
    label: 'E-mails',
    description: 'Informations et reçus par e-mail',
    icon: 'mail-outline',
  },
  paymentEnabled: {
    label: 'Paiements et reçus',
    description: 'Confirmations financières importantes',
    icon: 'card-outline',
  },
  reminderEnabled: {
    label: 'Rappels d’échéance',
    description: 'Dates limites des frais scolaires',
    icon: 'calendar-outline',
  },
  newsEnabled: {
    label: 'Annonces de l’école',
    description: 'Actualités générales du collège',
    icon: 'megaphone-outline',
  },
};

export default function Profile() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [prefs, setPrefs] = useState<Preferences>();
  const [newPhone, setNewPhone] = useState('');
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<'request' | 'confirm'>('request');
  const [message, setMessage] = useState('');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const load = () => api.get<Device[]>('/parent/devices').then(setDevices);
  useEffect(() => {
    void Promise.all([
      load(),
      api.get<Preferences>('/parent/notification-preferences').then(setPrefs),
    ]);
  }, []);
  const toggle = async (key: keyof Preferences, value: boolean) => {
    if (!prefs) return;
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      setPrefs(await api.patch<Preferences>('/parent/notification-preferences', { [key]: value }));
    } catch {
      setPrefs(previous);
    }
  };
  const requestChange = async () => {
    await api.post('/auth/phone-change/request', { newPhone });
    setPhoneStep('confirm');
    setMessage('Deux codes ont été envoyés : un sur chaque numéro.');
  };
  const confirmChange = async () => {
    await api.post('/auth/phone-change/confirm', {
      newPhone,
      currentPhoneCode: currentCode,
      newPhoneCode: newCode,
    });
    setMessage('Numéro modifié. Reconnectez-vous.');
    await clearTokens();
    router.replace('/login');
  };
  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    await clearTokens();
    router.replace('/');
  };
  return (
    <Screen navigation>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader title="Mon profil" subtitle="Préférences, sécurité et appareils connectés." />
        <View style={styles.identity}>
          <BrandMark />
          <View style={styles.identityBottom}>
            <View style={styles.parentIcon}>
              <Ionicons name="person-outline" size={23} color={colors.brand} />
            </View>
            <View style={styles.identityCopy}>
              <Text style={styles.parentTitle}>Espace parent CSB Noutcha KAMGUE</Text>
              <Text style={common.caption}>Compte vérifié et protégé</Text>
            </View>
            <StatusBadge label="Actif" tone="success" />
          </View>
        </View>
        <View style={styles.panel}>
          <SectionHeader title="Préférences de notification" />
          {prefs ? (
            Object.entries(prefLabels).map(([key, meta]) => (
              <View key={key} style={styles.prefRow}>
                <View style={styles.prefIcon}>
                  <Ionicons name={meta.icon} size={20} color={colors.brand} />
                </View>
                <View style={styles.prefCopy}>
                  <Text style={styles.prefLabel}>{meta.label}</Text>
                  <Text style={common.caption}>{meta.description}</Text>
                </View>
                <Switch
                  value={prefs[key as keyof Preferences]}
                  onValueChange={(value) => void toggle(key as keyof Preferences, value)}
                  trackColor={{ false: '#cadbd2', true: '#aacabd' }}
                  thumbColor={prefs[key as keyof Preferences] ? colors.brand : colors.surface}
                />
              </View>
            ))
          ) : (
            <Text style={common.subtitle}>Chargement…</Text>
          )}
          <Notice icon="shield-checkmark-outline">
            Les alertes financières critiques restent actives pour protéger votre compte.
          </Notice>
        </View>
        <View style={styles.panel}>
          <Pressable onPress={() => setPhoneOpen((value) => !value)} style={styles.disclosure}>
            <View>
              <Text style={common.sectionTitle}>Changer de numéro</Text>
              <Text style={common.caption}>Double vérification obligatoire</Text>
            </View>
            <Ionicons
              name={phoneOpen ? 'chevron-up' : 'chevron-down'}
              size={21}
              color={colors.brand}
            />
          </Pressable>
          {phoneOpen ? (
            <View style={styles.phoneForm}>
              <Field label="Nouveau numéro">
                <TextInput
                  style={common.input}
                  value={newPhone}
                  onChangeText={setNewPhone}
                  keyboardType="phone-pad"
                  placeholder="+237 6XX XX XX XX"
                />
              </Field>
              {phoneStep === 'confirm' ? (
                <>
                  <Field label="Code reçu sur l’ancien numéro">
                    <TextInput
                      style={common.input}
                      value={currentCode}
                      onChangeText={setCurrentCode}
                      keyboardType="number-pad"
                    />
                  </Field>
                  <Field label="Code reçu sur le nouveau numéro">
                    <TextInput
                      style={common.input}
                      value={newCode}
                      onChangeText={setNewCode}
                      keyboardType="number-pad"
                    />
                  </Field>
                </>
              ) : null}
              <Button
                label={phoneStep === 'request' ? 'Envoyer les codes' : 'Confirmer le changement'}
                icon="phone-portrait-outline"
                disabled={!newPhone}
                onPress={() =>
                  void (phoneStep === 'request' ? requestChange() : confirmChange()).catch(
                    (error: Error) => setMessage(error.message),
                  )
                }
              />
              {message ? (
                <Notice tone={message.includes('modifié') ? 'success' : 'info'}>{message}</Notice>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.devices}>
          <SectionHeader title="Mes appareils" />
          {devices.map((device) => (
            <View key={device.id} style={styles.deviceRow}>
              <View style={styles.deviceIcon}>
                <Ionicons
                  name={
                    device.platform.toLowerCase().includes('ios') ? 'logo-apple' : 'logo-android'
                  }
                  size={22}
                  color={colors.brand}
                />
              </View>
              <View style={styles.deviceCopy}>
                <Text style={styles.deviceName}>{device.deviceLabel ?? device.platform}</Text>
                <Text style={common.caption}>
                  Vu le {new Date(device.lastSeenAt).toLocaleDateString('fr-CM')}
                </Text>
              </View>
              <View style={styles.deviceActions}>
                <StatusBadge
                  label={device.status === 'ACTIVE' ? 'Actif' : device.status}
                  tone={device.status === 'ACTIVE' ? 'success' : 'neutral'}
                />
                {device.status === 'ACTIVE' ? (
                  <Pressable
                    onPress={async () => {
                      await api.post(`/parent/devices/${device.id}/revoke`);
                      await load();
                    }}
                  >
                    <Text style={styles.revoke}>Révoquer</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
        <Button
          label="Se déconnecter"
          icon="log-out-outline"
          variant="secondary"
          onPress={() => void logout()}
        />
        <Text style={styles.version}>CSB Noutcha KAMGUE</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 15, paddingBottom: 28 },
  identity: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
    backgroundColor: colors.surface,
    padding: 15,
    gap: 14,
  },
  identityBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  parentIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCopy: { flex: 1 },
  parentTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  panel: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 15,
    gap: 10,
  },
  prefRow: {
    minHeight: 65,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  prefIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefCopy: { flex: 1 },
  prefLabel: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  disclosure: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phoneForm: { gap: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: colors.line },
  devices: { gap: 9 },
  deviceRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 12,
  },
  deviceIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceCopy: { flex: 1 },
  deviceName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  deviceActions: { alignItems: 'flex-end', gap: 5 },
  revoke: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  version: { color: colors.muted, fontSize: 11, textAlign: 'center' },
});
