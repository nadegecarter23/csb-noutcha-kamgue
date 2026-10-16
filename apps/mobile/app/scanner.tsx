import { Text } from '../src/typography';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '@/api';
import { Button, colors, common, Screen } from '@/ui';

export default function Scanner() {
  const [permission, ask] = useCameraPermissions();
  const [done, setDone] = useState(false);
  if (!permission?.granted) {
    return (
      <Screen backgroundColor={colors.background}>
        <View style={styles.permission}>
          <View style={styles.permissionIcon}>
            <Ionicons name="camera-outline" size={36} color={colors.brand} />
          </View>
          <Text style={common.title}>Autoriser la caméra</Text>
          <Text style={[common.subtitle, styles.center]}>
            L’application CSB-NK utilise la caméra uniquement pour lire le QR code remis par
            l’établissement.
          </Text>
          <Button label="Autoriser la caméra" icon="camera-outline" onPress={() => void ask()} />
          <Button label="Retour" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }
  return (
    <CameraView
      style={styles.camera}
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={
        done
          ? undefined
          : async ({ data }) => {
              setDone(true);
              try {
                const token = data.includes('token=')
                  ? new URL(data).searchParams.get('token')
                  : data;
                await api.post('/parent/links/redeem', { token });
                router.replace('/home');
              } catch {
                setDone(false);
              }
            }
      }
    >
      <View style={styles.overlay}>
        <View style={styles.topControls}>
          <Pressable onPress={() => router.back()} style={styles.close}>
            <Ionicons name="close" size={24} color={colors.surface} />
          </Pressable>
          <Text style={styles.title}>Scanner le QR code CSB-NK</Text>
          <View style={styles.spacer} />
        </View>
        <View style={styles.frame}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
        <View style={styles.instructions}>
          <Ionicons name="qr-code-outline" size={22} color={colors.accent} />
          <Text style={styles.instructionsText}>
            Placez le QR code au centre du cadre. La lecture est automatique.
          </Text>
        </View>
      </View>
    </CameraView>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: '#102d2599',
    paddingHorizontal: 24,
    paddingTop: 58,
    paddingBottom: 46,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topControls: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00000055',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: colors.surface,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  spacer: { width: 44 },
  frame: { width: 270, height: 270, position: 'relative' },
  corner: { position: 'absolute', width: 54, height: 54, borderColor: colors.accent },
  topLeft: { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 16 },
  topRight: { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 16 },
  bottomLeft: {
    left: 0,
    bottom: 0,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderBottomLeftRadius: 16,
  },
  bottomRight: {
    right: 0,
    bottom: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: 16,
  },
  instructions: {
    maxWidth: 330,
    borderRadius: 12,
    backgroundColor: '#07142feb',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  instructionsText: {
    flex: 1,
    color: colors.surface,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 20,
  },
  permissionIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center', marginBottom: 12 },
});
