import { Text } from '../../src/typography';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { api, cached, downloadReportCard, MobileApiError } from '@/api';
import {
  colors,
  common,
  EmptyState,
  Notice,
  PageHeader,
  Screen,
  SectionHeader,
  StatusBadge,
} from '@/ui';

type Tab = 'reports' | 'grades' | 'attendance';
// Miroir de `parentAcademicsSchema` (@cplan/contracts), comme les autres écrans.
type ParentReportCardDto = {
  id: string;
  academicYear: string;
  periodName: string;
  className: string | null;
  overallAverage: number | null;
  rank: number | null;
  rankedCount: number;
  decision: string | null;
  publishedAt: string;
};
type ParentGradeDto = {
  id: string;
  date: string;
  title: string;
  subjectName: string;
  periodName: string;
  score: number | null;
  maxScore: number;
  scoreOn20: number | null;
  isAbsent: boolean;
  comment: string | null;
};
type ParentAcademicsDto = {
  academicYear: string | null;
  className: string | null;
  attendance: {
    sessions: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    rate: number | null;
    unjustifiedAbsences: number;
    events: Array<{
      id: string;
      date: string;
      mark: 'ABSENT' | 'LATE' | 'EXCUSED';
      minutesLate: number;
      subjectName: string | null;
      justificationStatus: 'NONE' | 'PENDING' | 'ACCEPTED' | 'REJECTED';
    }>;
  };
  grades: ParentGradeDto[];
  reportCards: ParentReportCardDto[];
};

const decimal = (value: number) => value.toFixed(2).replace('.', ',');
const dateLabel = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('fr-CM', {
    day: '2-digit',
    month: 'short',
  });
const ordinal = (rank: number) => (rank === 1 ? '1er' : `${rank}e`);
function mention(average: number | null) {
  if (average === null) return null;
  if (average >= 16) return 'Très bien';
  if (average >= 14) return 'Bien';
  if (average >= 12) return 'Assez bien';
  if (average >= 10) return 'Passable';
  return 'Insuffisant';
}
const markLabels = { ABSENT: 'Absence', LATE: 'Retard', EXCUSED: 'Absence excusée' } as const;
const justificationLabels = {
  NONE: 'Non justifiée',
  PENDING: 'Justificatif en cours',
  ACCEPTED: 'Justifiée',
  REJECTED: 'Justificatif refusé',
} as const;

export default function ChildResults() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [data, setData] = useState<ParentAcademicsDto>();
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<Tab>('reports');
  const [downloading, setDownloading] = useState<string>();
  const [downloadError, setDownloadError] = useState<string>();

  useEffect(() => {
    void cached(`parent.academics.${id}`, () =>
      api.get<ParentAcademicsDto>(`/parent/children/${id}/academics`),
    )
      .then((result) => {
        setData(result.data);
        setOffline(result.offline);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof MobileApiError
            ? reason.message
            : 'La scolarité n’a pas pu être chargée.',
        ),
      );
  }, [id]);

  const download = async (card: ParentReportCardDto) => {
    setDownloadError(undefined);
    setDownloading(card.id);
    try {
      await downloadReportCard(card.id);
    } catch (reason) {
      setDownloadError(
        reason instanceof MobileApiError
          ? reason.message
          : 'Le bulletin n’a pas pu être téléchargé. Vérifiez votre connexion.',
      );
    } finally {
      setDownloading(undefined);
    }
  };

  const latest = data?.reportCards[0];
  const subtitle = [name, data?.className, data?.academicYear].filter(Boolean).join(' · ');

  return (
    <Screen navigation>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader title="Scolarité" {...(subtitle ? { subtitle } : {})} back />
        {offline ? (
          <Notice tone="warning" icon="cloud-offline-outline">
            Consultation hors ligne · les dernières données disponibles sont affichées.
          </Notice>
        ) : null}
        {error ? (
          <Notice tone="danger" icon="alert-circle-outline">
            {error}
          </Notice>
        ) : null}
        {!data && !error ? <ActivityIndicator color={colors.brand} style={styles.loader} /> : null}

        {data ? (
          <>
            <LatestResult
              card={latest}
              attendanceRate={data.attendance.rate}
              downloading={downloading === latest?.id}
              onDownload={latest ? () => void download(latest) : undefined}
            />
            {downloadError ? (
              <Notice tone="danger" icon="alert-circle-outline">
                {downloadError}
              </Notice>
            ) : null}

            <View style={styles.tabs} accessibilityRole="tablist">
              {(
                [
                  ['reports', 'Bulletins', data.reportCards.length],
                  ['grades', 'Notes', data.grades.length],
                  ['attendance', 'Présences', data.attendance.sessions],
                ] as const
              ).map(([key, label, count]) => (
                <Pressable
                  key={key}
                  testID={`results-tab-${key}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === key }}
                  onPress={() => setTab(key)}
                  style={[styles.tab, tab === key && styles.tabActive]}
                >
                  <Text style={[styles.tabLabel, tab === key && styles.tabLabelActive]}>
                    {label}
                  </Text>
                  <Text style={[styles.tabCount, tab === key && styles.tabLabelActive]}>
                    {count}
                  </Text>
                </Pressable>
              ))}
            </View>

            {tab === 'reports' ? (
              <ReportCards
                cards={data.reportCards}
                downloading={downloading}
                onDownload={(card) => void download(card)}
              />
            ) : null}
            {tab === 'grades' ? <Grades grades={data.grades} /> : null}
            {tab === 'attendance' ? <Attendance attendance={data.attendance} /> : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function LatestResult({
  card,
  attendanceRate,
  downloading,
  onDownload,
}: {
  card: ParentReportCardDto | undefined;
  attendanceRate: number | null;
  downloading: boolean;
  onDownload: (() => void) | undefined;
}) {
  const label = mention(card?.overallAverage ?? null);
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>
            {card ? `Dernier bulletin · ${card.periodName}` : 'Aucun bulletin publié'}
          </Text>
          <View style={styles.averageLine}>
            <Text style={styles.average}>
              {card?.overallAverage !== null && card?.overallAverage !== undefined
                ? decimal(card.overallAverage)
                : '—'}
            </Text>
            <Text style={styles.averageScale}>/ 20</Text>
          </View>
          <Text style={styles.heroMeta}>
            {card?.rank ? `Rang ${ordinal(card.rank)} sur ${card.rankedCount}` : 'Rang non publié'}
          </Text>
        </View>
        <View style={styles.heroSide}>
          {label ? (
            <View style={styles.mention}>
              <Text style={styles.mentionText}>{label}</Text>
            </View>
          ) : null}
          <Text style={styles.heroAttendanceValue}>
            {attendanceRate === null ? '—' : `${Math.round(attendanceRate)} %`}
          </Text>
          <Text style={styles.heroAttendanceLabel}>de présence</Text>
        </View>
      </View>
      {card && onDownload ? (
        <Pressable
          testID="latest-report-card-download"
          accessibilityRole="button"
          accessibilityLabel={`Télécharger le bulletin du ${card.periodName}`}
          disabled={downloading}
          onPress={onDownload}
          style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}
        >
          {downloading ? (
            <ActivityIndicator color={colors.forest} />
          ) : (
            <Ionicons name="download-outline" size={19} color={colors.forest} />
          )}
          <Text style={styles.heroButtonText}>
            {downloading ? 'Préparation du bulletin…' : 'Télécharger le bulletin'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReportCards({
  cards,
  downloading,
  onDownload,
}: {
  cards: ParentReportCardDto[];
  downloading: string | undefined;
  onDownload: (card: ParentReportCardDto) => void;
}) {
  if (!cards.length)
    return (
      <EmptyState
        icon="document-text-outline"
        title="Aucun bulletin pour le moment"
        description="Les bulletins apparaissent ici dès que l’école les publie, à la fin de chaque période."
      />
    );
  return (
    <View style={styles.list}>
      {cards.map((card) => (
        <View key={card.id} style={styles.reportRow}>
          <View style={styles.reportCopy}>
            <Text style={styles.rowTitle}>{card.periodName}</Text>
            <Text style={common.caption}>
              {card.academicYear}
              {card.className ? ` · ${card.className}` : ''}
            </Text>
            <Text style={styles.reportMeta}>
              {card.overallAverage !== null ? `${decimal(card.overallAverage)}/20` : '—'}
              {card.rank ? ` · ${ordinal(card.rank)} / ${card.rankedCount}` : ''}
            </Text>
            {card.decision ? <Text style={common.caption}>{card.decision}</Text> : null}
          </View>
          <Pressable
            testID={`report-card-download-${card.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Télécharger le bulletin du ${card.periodName} ${card.academicYear}`}
            disabled={downloading === card.id}
            onPress={() => onDownload(card)}
            style={({ pressed }) => [styles.downloadButton, pressed && styles.pressed]}
          >
            {downloading === card.id ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Ionicons name="download-outline" size={20} color={colors.brand} />
            )}
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function Grades({ grades }: { grades: ParentGradeDto[] }) {
  const byPeriod = useMemo(() => {
    const groups = new Map<string, ParentGradeDto[]>();
    for (const grade of grades)
      groups.set(grade.periodName, [...(groups.get(grade.periodName) ?? []), grade]);
    return [...groups.entries()];
  }, [grades]);
  if (!grades.length)
    return (
      <EmptyState
        icon="create-outline"
        title="Aucune note publiée"
        description="Les notes s’affichent dès que l’enseignant publie une évaluation."
      />
    );
  return (
    <View style={styles.sections}>
      {byPeriod.map(([period, items]) => (
        <View key={period} style={styles.sections}>
          <SectionHeader title={period} />
          <View style={styles.list}>
            {items.map((grade) => {
              const low = grade.scoreOn20 !== null && grade.scoreOn20 < 10;
              return (
                <View key={grade.id} style={styles.gradeRow}>
                  <View style={styles.reportCopy}>
                    <Text style={styles.rowTitle}>{grade.subjectName}</Text>
                    <Text style={common.caption}>
                      {grade.title} · {dateLabel(grade.date)}
                    </Text>
                    {grade.comment ? <Text style={styles.comment}>« {grade.comment} »</Text> : null}
                  </View>
                  {grade.isAbsent ? (
                    <StatusBadge label="Absent" tone="warning" />
                  ) : (
                    <View style={styles.scoreBox}>
                      <Text style={[styles.score, low && styles.dangerText]}>
                        {grade.score === null ? '—' : decimal(grade.score).replace(',00', '')}
                      </Text>
                      <Text style={common.caption}>/ {grade.maxScore}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function Attendance({ attendance }: { attendance: ParentAcademicsDto['attendance'] }) {
  if (!attendance.sessions)
    return (
      <EmptyState
        icon="calendar-outline"
        title="Aucun appel validé"
        description="Les présences apparaissent ici une fois l’appel validé par l’établissement."
      />
    );
  const rate = attendance.rate ?? 0;
  return (
    <View style={styles.sections}>
      <View style={styles.attendanceCard}>
        <View style={styles.attendanceHead}>
          <Text style={common.sectionTitle}>Taux de présence</Text>
          <Text style={styles.attendanceRate}>{Math.round(rate)} %</Text>
        </View>
        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(rate) }}
        >
          <View style={[styles.progressFill, { width: `${Math.min(100, rate)}%` }]} />
        </View>
        <Text style={common.caption}>Sur {attendance.sessions} séances validées</Text>
        <View style={styles.tiles}>
          <Tile label="Présent" value={attendance.present} />
          <Tile label="Retards" value={attendance.late} />
          <Tile label="Absences" value={attendance.absent} tone="danger" />
          <Tile label="Excusées" value={attendance.excused} />
        </View>
      </View>
      {attendance.unjustifiedAbsences ? (
        <Notice tone="warning" icon="alert-circle-outline">
          {attendance.unjustifiedAbsences} absence
          {attendance.unjustifiedAbsences > 1 ? 's' : ''} non justifiée
          {attendance.unjustifiedAbsences > 1 ? 's' : ''}. Contactez la vie scolaire pour fournir un
          justificatif.
        </Notice>
      ) : null}
      {attendance.events.length ? (
        <>
          <SectionHeader title="Absences et retards" />
          <View style={styles.list}>
            {attendance.events.map((event) => (
              <View key={event.id} style={styles.gradeRow}>
                <View style={styles.dateBadge}>
                  <Text style={styles.dateText}>{dateLabel(event.date)}</Text>
                </View>
                <View style={styles.reportCopy}>
                  <Text style={styles.rowTitle}>
                    {markLabels[event.mark]}
                    {event.mark === 'LATE' && event.minutesLate
                      ? ` · ${event.minutesLate} min`
                      : ''}
                  </Text>
                  <Text style={common.caption}>{event.subjectName ?? 'Séance'}</Text>
                </View>
                {event.mark === 'LATE' ? null : (
                  <StatusBadge
                    label={justificationLabels[event.justificationStatus]}
                    tone={
                      event.justificationStatus === 'ACCEPTED' || event.mark === 'EXCUSED'
                        ? 'success'
                        : event.justificationStatus === 'PENDING'
                          ? 'neutral'
                          : 'warning'
                    }
                  />
                )}
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function Tile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'danger';
}) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, tone === 'danger' && value > 0 && styles.dangerText]}>
        {value}
      </Text>
      <Text style={common.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 30 },
  loader: { marginTop: 40 },
  pressed: { opacity: 0.75 },
  hero: { borderRadius: 18, backgroundColor: colors.forest, padding: 18, gap: 16 },
  heroTop: { flexDirection: 'row', gap: 12 },
  heroCopy: { flex: 1, gap: 4 },
  heroEyebrow: {
    color: '#aeb9d1',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  averageLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  average: { color: colors.surface, fontSize: 40, lineHeight: 46, fontWeight: '900' },
  averageScale: { color: '#aeb9d1', fontSize: 15, marginBottom: 7, fontWeight: '700' },
  heroMeta: { color: colors.surface, fontSize: 13, fontWeight: '700' },
  heroSide: { alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 },
  mention: {
    borderRadius: 99,
    backgroundColor: '#f1c40f',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  mentionText: { color: colors.forest, fontSize: 11, fontWeight: '900' },
  heroAttendanceValue: { color: colors.surface, fontSize: 22, fontWeight: '900' },
  heroAttendanceLabel: { color: '#aeb9d1', fontSize: 11, fontWeight: '700' },
  heroButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  tabs: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabActive: { backgroundColor: colors.surface },
  tabLabel: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  tabLabelActive: { color: colors.forest },
  tabCount: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  sections: { gap: 12 },
  list: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  reportRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  reportCopy: { flex: 1, gap: 3 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  reportMeta: { color: colors.forest, fontSize: 13, fontWeight: '800' },
  downloadButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  comment: { color: colors.muted, fontSize: 12, fontStyle: 'italic' },
  scoreBox: { alignItems: 'flex-end' },
  score: {
    color: colors.forest,
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  dangerText: { color: colors.danger },
  attendanceCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 15,
    gap: 10,
  },
  attendanceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  attendanceRate: { color: colors.forest, fontSize: 24, fontWeight: '900' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brandSoft,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.brand },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    borderRadius: 10,
    backgroundColor: colors.background,
    paddingVertical: 10,
  },
  tileValue: { color: colors.forest, fontSize: 18, fontWeight: '900' },
  dateBadge: {
    width: 52,
    borderRadius: 10,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    paddingVertical: 7,
  },
  dateText: { color: colors.brand, fontSize: 12, fontWeight: '800', textAlign: 'center' },
});
