import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttendanceMark,
  AttendanceSessionDto,
  ClassDto,
  TimetableEntryDto,
} from '@cplan/contracts';
import { api } from '@/shared/api/client';
import { useAcademicYear } from '@/features/academic/use-academic-year';
import { useAuthStore } from '@/features/auth/auth-store';

const marks: Array<{ value: AttendanceMark; label: string }> = [
  { value: 'PRESENT', label: 'Présent' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LATE', label: 'Retard' },
  { value: 'EXCUSED', label: 'Excusé' },
];
const today = () => new Date().toISOString().slice(0, 10);
const weekday = (date: string) => {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
};

export function AttendancePage() {
  const academic = useAcademicYear();
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const yearId = academic.selectedYear?.id;
  const [date, setDate] = useState(today());
  const [classId, setClassId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<AttendanceSessionDto | null>(null);
  const classes = useQuery({
    queryKey: ['classes', yearId],
    queryFn: () => api.get<ClassDto[]>(`/classes?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const entries = useQuery({
    queryKey: ['timetable-entries', yearId, classId],
    queryFn: () =>
      api.get<TimetableEntryDto[]>(
        `/timetable/entries?academic_year_id=${yearId}${classId ? `&class_id=${classId}` : ''}`,
      ),
    enabled: Boolean(yearId),
  });
  const sessions = useQuery({
    queryKey: ['attendance-sessions', yearId, classId, date],
    queryFn: () =>
      api.get<AttendanceSessionDto[]>(
        `/attendance/sessions?academic_year_id=${yearId}&date=${date}${classId ? `&class_id=${classId}` : ''}`,
      ),
    enabled: Boolean(yearId && date),
  });
  const dayEntries = useMemo(
    () =>
      (entries.data ?? []).filter(
        (entry) => entry.status === 'PUBLISHED' && entry.dayOfWeek === weekday(date),
      ),
    [date, entries.data],
  );
  const selected =
    draft ?? sessions.data?.find((item) => item.id === selectedId) ?? sessions.data?.[0] ?? null;
  useEffect(() => {
    if (!selectedId && sessions.data?.[0]) setSelectedId(sessions.data[0].id);
  }, [selectedId, sessions.data]);
  useEffect(() => {
    setDraft(null);
    setSelectedId('');
  }, [date, classId]);
  const refresh = () => void client.invalidateQueries({ queryKey: ['attendance-sessions'] });
  const open = useMutation({
    mutationFn: (timetableEntryId: string) =>
      api.post<AttendanceSessionDto>('/attendance/sessions', { timetableEntryId, date }),
    onSuccess: (data) => {
      setSelectedId(data.id);
      setDraft(data);
      refresh();
    },
  });
  const save = useMutation({
    mutationFn: (session: AttendanceSessionDto) =>
      api.put<AttendanceSessionDto>(`/attendance/sessions/${session.id}/records`, {
        records: session.records.map(({ enrollmentId, mark, minutesLate, note }) => ({
          enrollmentId,
          mark,
          minutesLate,
          note,
        })),
      }),
    onSuccess: (data) => {
      setDraft(data);
      refresh();
    },
  });
  const validate = useMutation({
    mutationFn: (id: string) =>
      api.post<{ session: AttendanceSessionDto; alertsQueued: number }>(
        `/attendance/sessions/${id}/validate`,
      ),
    onSuccess: (data) => {
      setDraft(data.session);
      refresh();
    },
  });
  const canTake = Boolean(user?.permissions.includes('attendance.take'));
  const canValidate = Boolean(user?.permissions.includes('attendance.validate'));
  const updateRecord = (
    enrollmentId: string,
    patch: Partial<AttendanceSessionDto['records'][number]>,
  ) => {
    if (!selected || selected.status === 'VALIDATED') return;
    setDraft({
      ...selected,
      records: selected.records.map((record) =>
        record.enrollmentId === enrollmentId ? { ...record, ...patch } : record,
      ),
    });
  };
  const computed = selected
    ? {
        present: selected.records.filter((item) => item.mark === 'PRESENT').length,
        absent: selected.records.filter((item) => item.mark === 'ABSENT').length,
        late: selected.records.filter((item) => item.mark === 'LATE').length,
        excused: selected.records.filter((item) => item.mark === 'EXCUSED').length,
      }
    : { present: 0, absent: 0, late: 0, excused: 0 };

  if (!yearId)
    return (
      <section className="attendance-page">
        <p>Sélectionnez une année scolaire.</p>
      </section>
    );
  return (
    <section className="attendance-page">
      <header className="attendance-header">
        <div>
          <h1>Présences et assiduité</h1>
          <p>Effectuez l’appel par cours, suivez les retards et déclenchez les alertes familles.</p>
        </div>
        {selected ? (
          <span className={`attendance-session-state ${selected.status.toLowerCase()}`}>
            {selected.status === 'VALIDATED' ? 'Appel validé' : 'Brouillon'}
          </span>
        ) : null}
      </header>
      <div className="attendance-filters">
        <label>
          Date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          Classe
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Toutes les classes</option>
            {classes.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="attendance-course-tabs">
          {sessions.data?.map((session) => (
            <button
              key={session.id}
              className={selected?.id === session.id ? 'active' : ''}
              onClick={() => {
                setSelectedId(session.id);
                setDraft(null);
              }}
            >
              {session.startTime} · {session.subjectName}
            </button>
          ))}
          {canTake &&
            dayEntries
              .filter(
                (entry) => !sessions.data?.some((session) => session.timetableEntryId === entry.id),
              )
              .map((entry) => (
                <button key={entry.id} onClick={() => open.mutate(entry.id)}>
                  + {entry.startTime} · {entry.subjectName}
                </button>
              ))}
        </div>
      </div>
      {!selected ? (
        <div className="attendance-empty">
          <strong>Aucun appel pour cette sélection</strong>
          <p>
            {dayEntries.length
              ? 'Choisissez un cours pour ouvrir la feuille d’appel.'
              : 'Aucun cours publié n’est prévu ce jour.'}
          </p>
        </div>
      ) : (
        <>
          <div className="attendance-summary">
            <article>
              <span>Effectif</span>
              <strong>{selected.records.length}</strong>
            </article>
            <article className="present">
              <span>Présents</span>
              <strong>{computed.present}</strong>
            </article>
            <article className="absent">
              <span>Absents</span>
              <strong>{computed.absent}</strong>
            </article>
            <article className="late">
              <span>Retards</span>
              <strong>{computed.late}</strong>
            </article>
            <article>
              <span>Excusés</span>
              <strong>{computed.excused}</strong>
            </article>
          </div>
          <div className="attendance-sheet">
            <header>
              <div>
                <h2>
                  {selected.className} · {selected.subjectName}
                </h2>
                <p>
                  {selected.startTime}–{selected.endTime}
                  {selected.teacherName ? ` · ${selected.teacherName}` : ''}
                </p>
              </div>
              <div>
                {canTake && selected.status === 'DRAFT' ? (
                  <button
                    className="button-secondary"
                    disabled={save.isPending}
                    onClick={() => save.mutate(selected)}
                  >
                    Enregistrer
                  </button>
                ) : null}
                {canValidate && selected.status === 'DRAFT' ? (
                  <button
                    className="button-primary"
                    disabled={validate.isPending}
                    onClick={() => validate.mutate(selected.id)}
                  >
                    Valider l’appel
                  </button>
                ) : null}
              </div>
            </header>
            <div className="attendance-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Élève</th>
                    <th>Statut</th>
                    <th>Minutes</th>
                    <th>Observation</th>
                    <th>Justificatif</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.records.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <strong>{record.studentName}</strong>
                        <span>{record.studentNumber}</span>
                      </td>
                      <td>
                        <div className="mark-options">
                          {marks.map((mark) => (
                            <button
                              type="button"
                              key={mark.value}
                              className={`${mark.value.toLowerCase()} ${record.mark === mark.value ? 'active' : ''}`}
                              disabled={selected.status === 'VALIDATED' || !canTake}
                              onClick={() =>
                                updateRecord(record.enrollmentId, {
                                  mark: mark.value,
                                  minutesLate:
                                    mark.value === 'LATE' ? Math.max(record.minutesLate, 5) : 0,
                                })
                              }
                            >
                              {mark.label}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td>
                        <input
                          aria-label={`Minutes de retard de ${record.studentName}`}
                          type="number"
                          min={0}
                          max={600}
                          value={record.minutesLate}
                          disabled={
                            record.mark !== 'LATE' || selected.status === 'VALIDATED' || !canTake
                          }
                          onChange={(event) =>
                            updateRecord(record.enrollmentId, {
                              minutesLate: Number(event.target.value),
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Observation de ${record.studentName}`}
                          value={record.note ?? ''}
                          disabled={selected.status === 'VALIDATED' || !canTake}
                          placeholder="Facultatif"
                          onChange={(event) =>
                            updateRecord(record.enrollmentId, { note: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <span
                          className={`justification ${record.justificationStatus.toLowerCase()}`}
                        >
                          {record.justificationStatus === 'NONE'
                            ? '—'
                            : record.justificationStatus === 'PENDING'
                              ? 'À traiter'
                              : record.justificationStatus === 'ACCEPTED'
                                ? 'Accepté'
                                : 'Refusé'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {validate.data ? (
            <p className="timetable-success">
              Appel validé · {validate.data.alertsQueued} alerte(s) famille mise(s) en file.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
