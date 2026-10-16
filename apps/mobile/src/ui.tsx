import { Text } from './typography';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from './theme';
export { colors } from './theme';

export const shadows = {
  soft:
    Platform.select<ViewStyle>({
      web: { boxShadow: '0 8px 18px rgba(16, 63, 55, 0.08)' },
      default: {
        shadowColor: colors.forestDeep,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
        elevation: 3,
      },
    }) ?? {},
};

const buttonShadow: ViewStyle =
  Platform.select<ViewStyle>({
    web: { boxShadow: '0 6px 12px rgba(20, 92, 79, 0.16)' },
    default: {
      shadowColor: colors.brand,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 2,
    },
  }) ?? {};

export const common = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  subtitle: { marginTop: 7, fontSize: 15, lineHeight: 22, color: colors.muted },
  eyebrow: {
    color: colors.brand,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  caption: { fontSize: 12, lineHeight: 17, color: colors.muted },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#cadbd2',
    backgroundColor: colors.surface,
    borderRadius: 11,
    paddingHorizontal: 15,
    fontSize: 16,
    color: colors.ink,
  },
  button: {
    minHeight: 54,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    flexDirection: 'row',
    gap: 9,
    ...buttonShadow,
  },
  buttonText: { color: colors.surface, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  link: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  linkText: { color: colors.brand, fontSize: 15, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  field: { gap: 7 },
  label: { color: '#3e574c', fontSize: 14, lineHeight: 19, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  divider: { height: 1, backgroundColor: colors.line },
});

// React Native transforme ces imports d’images statiques en identifiants natifs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mtnLogo = require('../assets/brand/mtn-momo.png') as ImageSourcePropType;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const orangeLogo = require('../assets/brand/orange-money.png') as ImageSourcePropType;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const csbNkLogo = require('../assets/brand/csb-nk-logo.png') as ImageSourcePropType;

export function Screen({
  children,
  navigation = false,
  backgroundColor = colors.background,
}: {
  children: ReactNode;
  navigation?: boolean;
  backgroundColor?: string;
}) {
  return (
    <SafeAreaView
      style={[common.safe, { backgroundColor }]}
      edges={['top', 'right', 'bottom', 'left']}
    >
      <View style={common.container}>{children}</View>
      {navigation ? <BottomNavigation /> : null}
    </SafeAreaView>
  );
}

export function FadeIn({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        delay,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        delay,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [delay, opacity, translateY]);
  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.brandLockup, compact && styles.brandLockupCompact]}>
      <Image
        source={csbNkLogo}
        style={[styles.brandLogo, compact && styles.brandLogoCompact]}
        resizeMode="contain"
        accessibilityLabel="Logo CSB Noutcha KAMGUE"
      />
      <View style={styles.brandCopy}>
        <Text style={styles.brandName}>CSB Noutcha KAMGUE</Text>
        {!compact ? <Text style={styles.brandSchool}>Apprendre · Persévérer · Réussir</Text> : null}
      </View>
    </View>
  );
}

export function ProviderLogo({ provider }: { provider: 'MTN_MOMO' | 'ORANGE_MONEY' }) {
  return (
    <Image
      source={provider === 'MTN_MOMO' ? mtnLogo : orangeLogo}
      style={styles.providerLogo}
      resizeMode="contain"
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  back = false,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderTop}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={22} color={colors.forest} />
          </Pressable>
        ) : null}
        <View style={styles.pageHeaderCopy}>
          <Text style={common.title}>{title}</Text>
          {subtitle ? <Text style={common.subtitle}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      <View style={styles.goldRule} />
    </View>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={common.field}>
      <Text style={common.label}>{label}</Text>
      {children}
      {hint ? <Text style={common.caption}>{hint}</Text> : null}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'danger';
export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: ComponentProps<typeof Ionicons>['name'];
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const variantStyle =
    variant === 'secondary'
      ? styles.buttonSecondary
      : variant === 'dark'
        ? styles.buttonDark
        : variant === 'danger'
          ? styles.buttonDanger
          : null;
  const labelStyle = variant === 'secondary' ? styles.buttonSecondaryText : common.buttonText;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        common.button,
        variantStyle,
        style,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={19}
          color={variant === 'secondary' ? colors.brand : colors.surface}
        />
      ) : null}
      <Text style={labelStyle}>{label}</Text>
    </Pressable>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={common.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={common.linkText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const toneStyle =
    tone === 'success'
      ? styles.badgeSuccess
      : tone === 'warning'
        ? styles.badgeWarning
        : tone === 'danger'
          ? styles.badgeDanger
          : styles.badgeNeutral;
  const textStyle =
    tone === 'success'
      ? styles.badgeSuccessText
      : tone === 'warning'
        ? styles.badgeWarningText
        : tone === 'danger'
          ? styles.badgeDangerText
          : styles.badgeNeutralText;
  return (
    <View style={[styles.badge, toneStyle]}>
      <Text style={[styles.badgeText, textStyle]}>{label}</Text>
    </View>
  );
}

export function Notice({
  children,
  tone = 'info',
  icon,
}: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'success' | 'danger';
  icon?: ComponentProps<typeof Ionicons>['name'];
}) {
  const backgroundColor =
    tone === 'warning'
      ? colors.warningSoft
      : tone === 'success'
        ? colors.successSoft
        : tone === 'danger'
          ? colors.dangerSoft
          : colors.brandSoft;
  const color =
    tone === 'warning'
      ? colors.warning
      : tone === 'success'
        ? colors.success
        : tone === 'danger'
          ? colors.danger
          : colors.brand;
  return (
    <View style={[styles.notice, { backgroundColor }]}>
      {icon ? <Ionicons name={icon} size={19} color={color} /> : null}
      <Text style={[styles.noticeText, { color }]}>{children}</Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.brand} />
      </View>
      <Text style={common.sectionTitle}>{title}</Text>
      <Text style={[common.subtitle, styles.centerText]}>{description}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.emptyButton} />
      ) : null}
    </View>
  );
}

export function Money({ value, style }: { value: number; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[styles.money, style]}>
      {value.toLocaleString('fr-CM')} <Text style={styles.moneyCurrency}>FCFA</Text>
    </Text>
  );
}

function BottomNavigation() {
  const pathname = usePathname();
  const items: Array<{
    label: string;
    icon: ComponentProps<typeof Ionicons>['name'];
    activeIcon: ComponentProps<typeof Ionicons>['name'];
    path: '/home' | '/children' | '/payments' | '/profile';
    active: boolean;
  }> = [
    {
      label: 'Accueil',
      icon: 'home-outline',
      activeIcon: 'home',
      path: '/home',
      active: pathname === '/home',
    },
    {
      label: 'Enfants',
      icon: 'people-outline',
      activeIcon: 'people',
      path: '/children',
      active: pathname.startsWith('/child') || pathname === '/children',
    },
    {
      label: 'Paiements',
      icon: 'card-outline',
      activeIcon: 'card',
      path: '/payments',
      active: pathname.startsWith('/payments'),
    },
    {
      label: 'Profil',
      icon: 'person-outline',
      activeIcon: 'person',
      path: '/profile',
      active: pathname === '/profile',
    },
  ];
  return (
    <View style={styles.bottomNav}>
      {items.map((item) => (
        <Pressable
          key={item.label}
          onPress={() => router.replace(item.path as never)}
          style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}
        >
          <Ionicons
            name={item.active ? item.activeIcon : item.icon}
            size={22}
            color={item.active ? colors.brand : colors.muted}
          />
          <Text style={[styles.navLabel, item.active && styles.navLabelActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.62 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandLockupCompact: { gap: 8, flexShrink: 1 },
  brandLogo: { width: 70, height: 78, borderRadius: 10, backgroundColor: colors.surface },
  brandLogoCompact: { width: 44, height: 49, borderRadius: 7 },
  brandCopy: { flex: 1 },
  brandName: {
    color: colors.forest,
    fontSize: 20,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  brandSchool: { color: colors.ink, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  providerLogo: { width: '100%', height: 52, borderRadius: 8 },
  pageHeader: { gap: 12, paddingTop: 2, paddingBottom: 5 },
  pageHeaderTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pageHeaderCopy: { flex: 1 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldRule: { width: 42, height: 3, borderRadius: 2, backgroundColor: colors.accent },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brand,
    ...Platform.select<ViewStyle>({
      web: { boxShadow: 'none' },
      default: { shadowOpacity: 0, elevation: 0 },
    }),
  },
  buttonSecondaryText: { color: colors.brand, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  buttonDark: { backgroundColor: colors.forestDeep },
  buttonDanger: { backgroundColor: colors.danger },
  sectionHeader: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
  badgeSuccess: { backgroundColor: colors.successSoft },
  badgeSuccessText: { color: colors.success },
  badgeWarning: { backgroundColor: colors.warningSoft },
  badgeWarningText: { color: colors.warning },
  badgeDanger: { backgroundColor: colors.dangerSoft },
  badgeDangerText: { color: colors.danger },
  badgeNeutral: { backgroundColor: '#eff3ee' },
  badgeNeutralText: { color: colors.muted },
  notice: { borderRadius: 11, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 34,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  centerText: { textAlign: 'center', maxWidth: 300 },
  emptyButton: { marginTop: 18, minWidth: 210 },
  money: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  moneyCurrency: { fontSize: 11, fontWeight: '800' },
  bottomNav: {
    minHeight: 66,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingTop: 7,
  },
  navItem: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 3 },
  navLabel: { color: colors.muted, fontSize: 11, lineHeight: 14, fontWeight: '600' },
  navLabelActive: { color: colors.brand, fontWeight: '800' },
});
