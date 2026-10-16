import { TextInput, Text } from '../src/typography';
import { useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { apiRequest } from '@/api';
import { Button, colors, common, Field, Notice, PageHeader, Screen } from '@/ui';

type Proof = { uri: string; name: string; type: string };
type ExternalMethod = 'BANK_TRANSFER' | 'BANK_DEPOSIT' | 'CHEQUE' | 'OTHER';
const methods = [
  { value: 'BANK_TRANSFER', label: 'Virement', icon: 'swap-horizontal-outline' },
  { value: 'BANK_DEPOSIT', label: 'Dépôt bancaire', icon: 'business-outline' },
  { value: 'CHEQUE', label: 'Chèque', icon: 'document-text-outline' },
  { value: 'OTHER', label: 'Autre', icon: 'ellipsis-horizontal' },
] as const;

export default function ExternalPayment() {
  const params = useLocalSearchParams<{
    enrollmentId: string;
    name: string;
    balance: string;
    method?: string;
    bankName?: string;
    paymentDate?: string;
    externalReference?: string;
    notes?: string;
  }>();
  const [amount, setAmount] = useState(params.balance ?? '');
  const [method, setMethod] = useState<ExternalMethod>(
    (params.method as ExternalMethod) ?? 'BANK_TRANSFER',
  );
  const [bankName, setBankName] = useState(params.bankName ?? '');
  const [paymentDate, setPaymentDate] = useState(
    params.paymentDate ?? new Date().toISOString().slice(0, 10),
  );
  const [reference, setReference] = useState(params.externalReference ?? '');
  const [notes, setNotes] = useState(params.notes ?? '');
  const [proof, setProof] = useState<Proof>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const openCamera = async () => {
    if (!permission?.granted && !(await requestPermission()).granted) {
      setError('Autorisez la caméra pour photographier le justificatif.');
      return;
    }
    setCameraOpen(true);
  };
  const capture = async () => {
    const picture = await camera.current?.takePictureAsync({ quality: 0.8 });
    if (picture) {
      setProof({ uri: picture.uri, name: 'justificatif.jpg', type: 'image/jpeg' });
      setCameraOpen(false);
    }
  };
  const importFile = async () => {
    try {
      const access = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!access.granted) return;
      const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(access.directoryUri);
      const uri = files.find((file) => /\.(jpe?g|png|webp|pdf)$/i.test(decodeURIComponent(file)));
      if (!uri) {
        setError('Aucune image ou PDF trouvé dans ce dossier.');
        return;
      }
      const decoded = decodeURIComponent(uri);
      const name = decoded.split('/').pop() ?? 'justificatif';
      const ext = name.split('.').pop()?.toLowerCase();
      setProof({
        uri,
        name,
        type:
          ext === 'pdf'
            ? 'application/pdf'
            : ext === 'png'
              ? 'image/png'
              : ext === 'webp'
                ? 'image/webp'
                : 'image/jpeg',
      });
    } catch {
      setError('Import indisponible sur cet appareil. Utilisez la caméra.');
    }
  };
  const submit = async () => {
    if (!proof) {
      setError('Le justificatif est obligatoire.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const form = new FormData();
      form.append('enrollmentId', params.enrollmentId);
      form.append('amount', amount);
      form.append('paymentMethod', method);
      form.append('bankName', bankName);
      form.append('paymentDate', paymentDate);
      form.append('externalReference', reference);
      form.append('notes', notes);
      form.append('proof', {
        uri: proof.uri,
        name: proof.name,
        type: proof.type,
      } as unknown as Blob);
      await apiRequest('/parent/payments/external', { method: 'POST', form });
      Alert.alert(
        'Déclaration envoyée',
        'Votre solde sera mis à jour après vérification comptable.',
      );
      router.replace('/payments');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Envoi impossible.');
    } finally {
      setSending(false);
    }
  };
  if (cameraOpen)
    return (
      <View style={styles.cameraShell}>
        <CameraView ref={camera} style={styles.camera} facing="back" />
        <View style={styles.cameraHeader}>
          <Pressable onPress={() => setCameraOpen(false)} style={styles.cameraClose}>
            <Ionicons name="close" size={24} color={colors.surface} />
          </Pressable>
          <Text style={styles.cameraTitle}>Photographier le justificatif</Text>
          <View style={styles.cameraSpacer} />
        </View>
        <View style={styles.cameraActions}>
          <Text style={styles.cameraHint}>
            Cadrez clairement le montant, la date et la référence.
          </Text>
          <Button label="Capturer" icon="camera" onPress={() => void capture()} />
        </View>
      </View>
    );
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title="Déclarer un paiement"
          subtitle={`${params.name} · paiement déjà effectué hors CSB Noutcha KAMGUE.`}
          back
        />
        <Notice tone="warning" icon="time-outline">
          Cette déclaration sera examinée par la comptabilité avant de modifier le solde. Elle ne
          constitue pas encore un paiement crédité.
        </Notice>
        <Field label="Montant payé (FCFA)">
          <TextInput
            style={common.input}
            keyboardType="number-pad"
            value={amount}
            onChangeText={setAmount}
          />
        </Field>
        <Field label="Mode de paiement">
          <View style={styles.methodGrid}>
            {methods.map((item) => (
              <Pressable
                key={item.value}
                onPress={() => setMethod(item.value)}
                style={[styles.method, method === item.value && styles.methodSelected]}
              >
                <Ionicons
                  name={item.icon}
                  size={21}
                  color={method === item.value ? colors.brand : colors.muted}
                />
                <Text
                  style={[styles.methodText, method === item.value && styles.methodTextSelected]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>
        <Field label="Banque ou établissement">
          <TextInput
            style={common.input}
            value={bankName}
            onChangeText={setBankName}
            placeholder="Ex. Afriland First Bank"
            placeholderTextColor="#73877f"
          />
        </Field>
        <View style={styles.twoColumns}>
          <View style={styles.column}>
            <Field label="Date du paiement">
              <TextInput
                style={common.input}
                value={paymentDate}
                onChangeText={setPaymentDate}
                placeholder="AAAA-MM-JJ"
              />
            </Field>
          </View>
          <View style={styles.column}>
            <Field label="Référence">
              <TextInput style={common.input} value={reference} onChangeText={setReference} />
            </Field>
          </View>
        </View>
        <Field label="Notes" hint="Ajoutez une précision utile à la comptabilité.">
          <TextInput
            style={[common.input, styles.notes]}
            multiline
            value={notes}
            onChangeText={setNotes}
            textAlignVertical="top"
          />
        </Field>
        <View style={styles.proofSection}>
          <View style={styles.proofHeader}>
            <View>
              <Text style={common.sectionTitle}>Justificatif</Text>
              <Text style={common.caption}>Image nette ou document PDF obligatoire.</Text>
            </View>
            {proof ? <Ionicons name="checkmark-circle" size={25} color={colors.success} /> : null}
          </View>
          {proof ? (
            <View style={styles.proofPreview}>
              {proof.type !== 'application/pdf' ? (
                <Image source={{ uri: proof.uri }} style={styles.proofImage} />
              ) : (
                <View style={styles.pdf}>
                  <Ionicons name="document-text-outline" size={32} color={colors.brand} />
                  <Text style={styles.pdfName}>{proof.name}</Text>
                </View>
              )}
              <Pressable onPress={() => setProof(undefined)} style={styles.removeProof}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={styles.removeText}>Retirer</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.proofActions}>
              <Button
                label="Photographier"
                icon="camera-outline"
                variant="dark"
                onPress={() => void openCamera()}
                style={styles.flex}
              />
              <Button
                label="Importer"
                icon="folder-open-outline"
                variant="secondary"
                onPress={() => void importFile()}
                style={styles.flex}
              />
            </View>
          )}
        </View>
        {error ? (
          <Notice tone="danger" icon="alert-circle-outline">
            {error}
          </Notice>
        ) : null}
        <Button
          label={sending ? 'Envoi sécurisé…' : 'Envoyer pour validation'}
          icon="shield-checkmark-outline"
          disabled={sending || !amount || !reference || !proof}
          onPress={() => void submit()}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 32 },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  method: {
    width: '48.5%',
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: 11,
  },
  methodSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  methodText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  methodTextSelected: { color: colors.brand },
  twoColumns: { flexDirection: 'row', gap: 10 },
  column: { flex: 1 },
  notes: { minHeight: 88, paddingTop: 14 },
  proofSection: {
    gap: 13,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 15,
  },
  proofHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  proofActions: { flexDirection: 'row', gap: 9 },
  flex: { flex: 1 },
  proofPreview: { gap: 9 },
  proofImage: { height: 190, borderRadius: 11, backgroundColor: colors.background },
  pdf: {
    minHeight: 92,
    borderRadius: 11,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pdfName: { color: colors.brand, fontSize: 13, fontWeight: '800' },
  removeProof: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  removeText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  cameraShell: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraHeader: {
    position: 'absolute',
    top: 54,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cameraClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0008',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraTitle: { color: colors.surface, fontSize: 15, fontWeight: '800' },
  cameraSpacer: { width: 44 },
  cameraActions: { position: 'absolute', left: 20, right: 20, bottom: 42, gap: 12 },
  cameraHint: {
    borderRadius: 10,
    backgroundColor: '#000A',
    padding: 12,
    color: colors.surface,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
