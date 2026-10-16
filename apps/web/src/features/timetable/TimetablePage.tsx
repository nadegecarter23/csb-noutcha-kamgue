import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClassDto,
  PedagogyOverviewDto,
  TimetableEntryDto,
  TimetableRoomDto,
} from '@cplan/contracts';
import { api } from '@/shared/api/client';
import { useAcademicYear } from '@/features/academic/use-academic-year';
import { useAuthStore } from '@/features/auth/auth-store';

const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="pedagogy-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="pedagogy-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function TimetablePage() {
  const academic = useAcademicYear();
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const yearId = academic.selectedYear?.id;
  const [modal, setModal] = useState<'room' | 'entry' | null>(null);
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const query = new URLSearchParams({ academic_year_id: yearId ?? '' });
  if (classId) query.set('class_id', classId);
  if (teacherId) query.set('teacher_user_id', teacherId);

  const overview = useQuery({
    queryKey: ['pedagogy-overview', yearId],
    queryFn: () => api.get<PedagogyOverviewDto>(`/pedagogy/overview?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const classes = useQuery({
    queryKey: ['classes', yearId],
    queryFn: () => api.get<ClassDto[]>(`/classes?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const rooms = useQuery({
    queryKey: ['timetable-rooms'],
    queryFn: () => api.get<TimetableRoomDto[]>('/timetable/rooms'),
  });
  const entries = useQuery({
    queryKey: ['timetable-entries', yearId, classId, teacherId],
    queryFn: () => api.get<TimetableEntryDto[]>(`/timetable/entries?${query}`),
    enabled: Boolean(yearId),
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ['timetable-entries'] });
  const createRoom = useMutation({
    mutationFn: (body: unknown) => api.post('/timetable/rooms', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['timetable-rooms'] });
      setModal(null);
    },
  });
  const createEntry = useMutation({
    mutationFn: (body: unknown) => api.post('/timetable/entries', body),
    onSuccess: () => {
      refresh();
      setModal(null);
    },
  });
  const cancelEntry = useMutation({
    mutationFn: (id: string) => api.post(`/timetable/entries/${id}/cancel`),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: () =>
      api.post<{ published: number }>('/timetable/publish', { academicYearId: yearId }),
    onSuccess: refresh,
  });
  const grouped = useMemo(
    () =>
      days.map((_, index) => (entries.data ?? []).filter((entry) => entry.dayOfWeek === index + 1)),
    [entries.data],
  );
  const canManage = Boolean(user?.permissions.includes('timetable.manage'));
  const canPublish = Boolean(user?.permissions.includes('timetable.publish'));
  const draftCount = entries.data?.filter((entry) => entry.status === 'DRAFT').length ?? 0;

  if (!yearId)
    return (
      <section className="timetable-page">
        <p>Sélectionnez une année scolaire.</p>
      </section>
    );
  return (
    <section className="timetable-page">
      <header className="timetable-header">
        <div>
          <h1>Emplois du temps</h1>
          <p>Planifiez les cours sans conflit de classe, d’enseignant ou de salle.</p>
        </div>
        <div className="timetable-actions">
          {canManage ? (
            <>
              <button className="button-secondary" onClick={() => setModal('room')}>
                Ajouter une salle
              </button>
              <button className="button-primary" onClick={() => setModal('entry')}>
                + Planifier un cours
              </button>
            </>
          ) : null}
          {canPublish ? (
            <button
              className="button-publish"
              disabled={!draftCount || publish.isPending}
              onClick={() => publish.mutate()}
            >
              {publish.isPending
                ? 'Publication…'
                : `Publier${draftCount ? ` (${draftCount})` : ''}`}
            </button>
          ) : null}
        </div>
      </header>
      <div className="timetable-toolbar">
        <label>
          Classe
          <select
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
              setTeacherId('');
            }}
          >
            <option value="">Toutes les classes</option>
            {classes.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Enseignant
          <select
            value={teacherId}
            onChange={(event) => {
              setTeacherId(event.target.value);
              setClassId('');
            }}
          >
            <option value="">Tous les enseignants</option>
            {overview.data?.teachers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <strong>{entries.data?.length ?? 0}</strong>
          <span>cours planifiés</span>
        </div>
        <div>
          <strong>{rooms.data?.filter((room) => room.status === 'ACTIVE').length ?? 0}</strong>
          <span>salles actives</span>
        </div>
      </div>
      <div className="timetable-week">
        {days.map((day, dayIndex) => (
          <section key={day}>
            <header>
              <strong>{day}</strong>
              <span>{grouped[dayIndex]?.length ?? 0} cours</span>
            </header>
            <div className="day-lessons">
              {grouped[dayIndex]?.map((entry) => (
                <article key={entry.id} style={{ borderLeftColor: entry.subjectColor }}>
                  <div>
                    <time>
                      {entry.startTime}–{entry.endTime}
                    </time>
                    <span className={`timetable-state ${entry.status.toLowerCase()}`}>
                      {entry.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'}
                    </span>
                  </div>
                  <h3>{entry.subjectName}</h3>
                  <p>
                    {entry.className} · {entry.teacherName ?? 'Sans enseignant'}
                  </p>
                  <footer>
                    <span>{entry.roomName ?? 'Salle non définie'}</span>
                    {canManage ? (
                      <button
                        disabled={cancelEntry.isPending}
                        onClick={() => cancelEntry.mutate(entry.id)}
                      >
                        Annuler
                      </button>
                    ) : null}
                  </footer>
                </article>
              ))}
              {!grouped[dayIndex]?.length ? <p className="day-empty">Aucun cours</p> : null}
            </div>
          </section>
        ))}
      </div>
      {publish.data ? (
        <p className="timetable-success">{publish.data.published} créneau(x) publié(s).</p>
      ) : null}
      {modal === 'room' ? (
        <Modal title="Ajouter une salle" onClose={() => setModal(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              createRoom.mutate({
                code: String(data.get('code')),
                name: String(data.get('name')),
                capacity: data.get('capacity') ? Number(data.get('capacity')) : null,
              });
            }}
          >
            <label>
              Code
              <input name="code" required placeholder="S101" />
            </label>
            <label>
              Nom
              <input name="name" required placeholder="Salle 101" />
            </label>
            <label>
              Capacité
              <input name="capacity" type="number" min={1} max={500} placeholder="60" />
            </label>
            {createRoom.error ? <p className="form-error">{createRoom.error.message}</p> : null}
            <footer>
              <button type="button" className="button-secondary" onClick={() => setModal(null)}>
                Annuler
              </button>
              <button className="button-primary" disabled={createRoom.isPending}>
                Ajouter
              </button>
            </footer>
          </form>
        </Modal>
      ) : null}
      {modal === 'entry' ? (
        <Modal title="Planifier un cours" onClose={() => setModal(null)}>
          <EntryForm
            yearId={yearId}
            assignments={overview.data?.assignments ?? []}
            rooms={rooms.data ?? []}
            pending={createEntry.isPending}
            error={createEntry.error?.message ?? ''}
            onCancel={() => setModal(null)}
            onSubmit={(body) => createEntry.mutate(body)}
          />
        </Modal>
      ) : null}
    </section>
  );
}

function EntryForm({
  yearId,
  assignments,
  rooms,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  yearId: string;
  assignments: PedagogyOverviewDto['assignments'];
  rooms: TimetableRoomDto[];
  pending: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (body: unknown) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      academicYearId: yearId,
      teachingAssignmentId: String(data.get('assignment')),
      roomId: String(data.get('room')) || null,
      dayOfWeek: Number(data.get('day')),
      startTime: String(data.get('start')),
      endTime: String(data.get('end')),
    });
  };
  return (
    <form onSubmit={submit}>
      <label>
        Enseignement
        <select name="assignment" required defaultValue="">
          <option value="" disabled>
            Sélectionner
          </option>
          {assignments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.subjectName} · {item.className} · {item.teacherName ?? 'sans enseignant'}
            </option>
          ))}
        </select>
      </label>
      <label>
        Salle
        <select name="room" defaultValue="">
          <option value="">Non définie</option>
          {rooms
            .filter((room) => room.status === 'ACTIVE')
            .map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
                {room.capacity ? ` (${room.capacity})` : ''}
              </option>
            ))}
        </select>
      </label>
      <label>
        Jour
        <select name="day" defaultValue="1">
          {days.map((day, index) => (
            <option key={day} value={index + 1}>
              {day}
            </option>
          ))}
        </select>
      </label>
      <label>
        Début
        <input name="start" type="time" defaultValue="08:00" required />
      </label>
      <label>
        Fin
        <input name="end" type="time" defaultValue="09:00" required />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <footer>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Annuler
        </button>
        <button className="button-primary" disabled={pending}>
          {pending ? 'Planification…' : 'Planifier'}
        </button>
      </footer>
    </form>
  );
}
