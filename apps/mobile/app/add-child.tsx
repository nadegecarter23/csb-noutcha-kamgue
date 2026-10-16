import { TextInput, Text } from '../src/typography';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api } from '@/api';
import { Button, colors, common, Field, Notice, PageHeader, Screen, SectionHeader } from '@/ui';

type School = { id: string; name: string };

export default function AddChild() {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  useEffect(() => {
    void api.get<School[]>('/parent/schools').then((rows) => {
      setSchools(rows);
      setSchoolId(rows[0]?.id ?? '');
    });
  }, []);
  const redeem = async () => {
    try {
      await api.post('/parent/links/redeem', { shortCode: code.trim() });
      setMessage('Enfant associé avec succès.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Code invalide.');
    }
  };
  const manual = async () => {
    try {
      await api.post('/parent/link-requests', {
        schoolId,
        claimedStudentNumber: number || undefined,
        claimedStudentName: name || undefined,
        relationship: 'AUTRE',
      });
      setMessage(
        'Demande envoyée à l’établissement. Vous recevrez une notification après vérification.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Demande impossible.');
    }
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageHeader
          title="Associer un enfant"
          subtitle="Choisissez la méthode la plus simple pour vous."
          back
        />
        <Pressable onPress={() => router.push('/scanner')} style={styles.scanCard}>
          <View style={styles.scanIcon}>
            <Ionicons name="qr-code-outline" size={30} color={colors.surface} />
          </View>
          <View style={styles.scanCopy}>
            <Text style={styles.scanTitle}>Scanner le QR code</Text>
            <Text style={styles.scanText}>
              Le moyen le plus rapide avec le document remis par le collège.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.surface} />
        </Pressable>
        <View style={styles.orRow}>
          <View style={styles.line} />
          <Text style={common.caption}>OU SAISIR LE CODE</Text>
          <View style={styles.line} />
        </View>
        <View style={styles.codePanel}>
          <Field label="Code court">
            <TextInput
              testID="association-code"
              accessibilityLabel="Code court"
              style={[common.input, styles.codeInput]}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              placeholder="Votre code court"
              placeholderTextColor="#73877f"
            />
          </Field>
          <Button
            label="Associer avec ce code"
            disabled={!code.trim()}
            onPress={() => void redeem()}
          />
          <Pressable style={common.link} onPress={() => router.push('/associations')}>
            <Text style={common.linkText}>Voir les propositions détectées</Text>
          </Pressable>
        </View>
        <SectionHeader title="Demande manuelle" />
        <Text style={common.caption}>
          Utilisez cette option uniquement si vous n’avez ni QR code ni code court.
        </Text>
        <Field label="Établissement">
          <View style={styles.schoolList}>
            {schools.map((school) => (
              <Pressable
                key={school.id}
                onPress={() => setSchoolId(school.id)}
                style={[styles.schoolRow, schoolId === school.id && styles.schoolRowSelected]}
              >
                <View style={[styles.radio, schoolId === school.id && styles.radioSelected]}>
                  {schoolId === school.id ? <View style={styles.radioDot} /> : null}
                </View>
                <Text style={styles.schoolName}>{school.name}</Text>
              </Pressable>
            ))}
          </View>
        </Field>
        <Field label="Matricule" hint="Laissez vide si vous ne le connaissez pas.">
          <TextInput
            testID="association-student-number"
            accessibilityLabel="Matricule"
            style={common.input}
            value={number}
            onChangeText={setNumber}
          />
        </Field>
        <Field label="Nom complet de l’enfant">
          <TextInput
            testID="association-student-name"
            accessibilityLabel="Nom complet de l’enfant"
            style={common.input}
            value={name}
            onChangeText={setName}
          />
        </Field>
        <Button
          label="Envoyer la demande"
          icon="send-outline"
          disabled={!schoolId || (!number && !name)}
          onPress={() => void manual()}
        />
        {message ? (
          <Notice
            tone={message.includes('succès') || message.includes('envoyée') ? 'success' : 'danger'}
            icon="information-circle-outline"
          >
            {message}
          </Notice>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 17, paddingBottom: 30 },
  scanCard: {
    minHeight: 104,
    borderRadius: 15,
    backgroundColor: colors.forest,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 16,
  },
  scanIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#237968',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCopy: { flex: 1 },
  scanTitle: { color: colors.surface, fontSize: 17, fontWeight: '800' },
  scanText: { marginTop: 4, color: '#d4e9df', fontSize: 12, lineHeight: 17 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: colors.line },
  codePanel: {
    gap: 13,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 15,
  },
  codeInput: { textAlign: 'center', letterSpacing: 1.5, fontWeight: '800' },
  schoolList: { gap: 8 },
  schoolRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: 13,
  },
  schoolRowSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#8ba598',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  schoolName: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '600' },
});
