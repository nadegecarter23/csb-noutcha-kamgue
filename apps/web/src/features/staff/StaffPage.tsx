import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  StaffLeaveDto,
  StaffMemberDto,
  StaffOrganizationReferenceDto,
} from '@cplan/contracts';
import { api } from '@/shared/api/client';
import { useAcademicYear } from '@/features/academic/use-academic-year';
import { useAuthStore } from '@/features/auth/auth-store';

const statusLabel = {
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  ON_LEAVE: 'En congé',
  LEFT: 'Sorti',
} as const;
const employmentLabel = {
  PERMANENT: 'Permanent',
  FIXED_TERM: 'CDD',
  VACATION: 'Vacataire',
  INTERN: 'Stagiaire',
} as const;

export function StaffPage() {
  const academic = useAcademicYear(),
    user = useAuthStore((s) => s.user),
    client = useQueryClient(),
    yearId = academic.selectedYear?.id;
  const [tab, setTab] = useState<'team' | 'chart' | 'leaves'>('team'),
    [selected, setSelected] = useState<StaffMemberDto | null>(null),
    [newLeave, setNewLeave] = useState(false),
    [department, setDepartment] = useState('');
  const staff = useQuery({
    queryKey: ['staff', yearId],
    queryFn: () => api.get<StaffMemberDto[]>(`/staff?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const organization = useQuery({
    queryKey: ['staff-organization'],
    queryFn: () => api.get<StaffOrganizationReferenceDto>('/staff/organization'),
  });
  const leaves = useQuery({
    queryKey: ['staff-leaves'],
    queryFn: () => api.get<StaffLeaveDto[]>('/staff-leaves'),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['staff'] });
    void client.invalidateQueries({ queryKey: ['staff-leaves'] });
  };
  const update = useMutation({
      mutationFn: ({ id, body }: { id: string; body: unknown }) =>
        api.patch<StaffMemberDto>(`/staff/${id}`, body),
      onSuccess: () => {
        setSelected(null);
        refresh();
      },
    }),
    createLeave = useMutation({
      mutationFn: (body: unknown) => api.post('/staff-leaves', body),
      onSuccess: () => {
        setNewLeave(false);
        refresh();
      },
    }),
    decide = useMutation({
      mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
        api.post(`/staff-leaves/${id}/decision`, { status }),
      onSuccess: refresh,
    });
  const canManage = Boolean(user?.permissions.includes('staff.manage')),
    canLeaves = Boolean(user?.permissions.includes('staff_leaves.manage')),
    members = staff.data ?? [],
    visible = department ? members.filter((x) => x.departmentId === department) : members;
  const submitProfile = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    update.mutate({
      id: selected.id,
      body: {
        employeeNumber: String(f.get('number')) || null,
        jobTitle: String(f.get('job')) || null,
        employmentType: String(f.get('employment')) || null,
        hiredAt: String(f.get('hired')) || null,
        contractEnd: String(f.get('end')) || null,
        weeklyWorkload: Number(f.get('workload')),
        status: String(f.get('status')),
        departmentId: String(f.get('department')) || null,
        positionId: String(f.get('position')) || null,
        supervisorId: String(f.get('supervisor')) || null,
        isStaffDelegate: f.get('delegate') === 'on',
      },
    });
  };
  const submitLeave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    createLeave.mutate({
      staffProfileId: String(f.get('staff')),
      type: String(f.get('type')),
      startsAt: String(f.get('start')),
      endsAt: String(f.get('end')),
      reason: String(f.get('reason')),
    });
  };
  return (
    <section className="staff-page">
      <header>
        <div>
          <h1>Personnel et organigramme</h1>
          <p>Fonctions, rattachements, périmètres, charges et congés.</p>
        </div>
        {tab === 'leaves' && canLeaves ? (
          <button className="button-primary" onClick={() => setNewLeave((v) => !v)}>
            + Demande de congé
          </button>
        ) : null}
      </header>
      <div className="staff-kpis">
        <article>
          <span>Effectif</span>
          <strong>{members.length}</strong>
        </article>
        <article>
          <span>Actifs</span>
          <strong>{members.filter((x) => x.status === 'ACTIVE').length}</strong>
        </article>
        <article>
          <span>Services</span>
          <strong>{organization.data?.departments.length ?? 0}</strong>
        </article>
        <article>
          <span>Multi-affectés</span>
          <strong>{members.filter((x) => (x.assignments?.length ?? 0) > 1).length}</strong>
        </article>
      </div>
      <div className="life-tabs">
        <button className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>
          Équipe
        </button>
        <button className={tab === 'chart' ? 'active' : ''} onClick={() => setTab('chart')}>
          Organigramme
        </button>
        <button className={tab === 'leaves' ? 'active' : ''} onClick={() => setTab('leaves')}>
          Congés <span>{leaves.data?.filter((x) => x.status === 'PENDING').length ?? 0}</span>
        </button>
      </div>
      {tab !== 'leaves' ? (
        <>
          <label className="staff-filter">
            Service{' '}
            <select value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">Tous les services</option>
              {organization.data?.departments.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.organizationalUnitName ? ` · ${x.organizationalUnitName}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="staff-table">
            <table>
              <thead>
                <tr>
                  <th>Collaborateur</th>
                  <th>Fonction</th>
                  <th>Rattachement</th>
                  <th>Périmètres</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.fullName}</strong>
                      <span>
                        {item.employeeNumber ?? 'Matricule à renseigner'} · {item.phone}
                      </span>
                    </td>
                    <td>
                      {item.positionName ?? item.jobTitle ?? 'Non renseignée'}
                      <span>{item.departmentName ?? 'Sans service'}</span>
                    </td>
                    <td>
                      {item.supervisorName ? `Sous ${item.supervisorName}` : 'Direction'}
                      {item.isStaffDelegate ? <span>Délégué du personnel</span> : null}
                    </td>
                    <td>{item.assignments?.map((x) => x.label).join(', ') || 'Établissement'}</td>
                    <td>
                      <em className={`staff-status ${item.status.toLowerCase()}`}>
                        {statusLabel[item.status]}
                      </em>
                    </td>
                    <td>
                      {canManage ? (
                        <button onClick={() => setSelected(item)}>Modifier</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {newLeave ? (
            <form className="staff-leave-form" onSubmit={submitLeave}>
              <label>
                Collaborateur
                <select name="staff" required>
                  {members
                    .filter((x) => x.status !== 'LEFT')
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.fullName}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Type
                <input name="type" required />
              </label>
              <label>
                Du
                <input name="start" type="date" required />
              </label>
              <label>
                Au
                <input name="end" type="date" required />
              </label>
              <label className="wide">
                Motif
                <textarea name="reason" required />
              </label>
              <button className="button-primary">Enregistrer</button>
            </form>
          ) : null}
          <div className="leave-list">
            {leaves.data?.map((x) => (
              <article key={x.id}>
                <div>
                  <strong>{x.staffName}</strong>
                  <span>
                    {x.type} · du {new Date(x.startsAt).toLocaleDateString('fr-CM')} au{' '}
                    {new Date(x.endsAt).toLocaleDateString('fr-CM')}
                  </span>
                </div>
                <p>{x.reason}</p>
                <footer>
                  <em className={`leave-${x.status.toLowerCase()}`}>
                    {x.status === 'PENDING'
                      ? 'En attente'
                      : x.status === 'APPROVED'
                        ? 'Approuvé'
                        : 'Refusé'}
                  </em>
                  {x.status === 'PENDING' && canLeaves ? (
                    <div>
                      <button onClick={() => decide.mutate({ id: x.id, status: 'REJECTED' })}>
                        Refuser
                      </button>
                      <button
                        className="button-primary"
                        onClick={() => decide.mutate({ id: x.id, status: 'APPROVED' })}
                      >
                        Approuver
                      </button>
                    </div>
                  ) : null}
                </footer>
              </article>
            ))}
          </div>
        </>
      )}
      {selected ? (
        <div className="pedagogy-modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section className="pedagogy-modal" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <h2>Dossier de {selected.fullName}</h2>
              <button onClick={() => setSelected(null)}>×</button>
            </header>
            <form onSubmit={submitProfile}>
              <label>
                Matricule
                <input name="number" defaultValue={selected.employeeNumber ?? ''} />
              </label>
              <label>
                Intitulé libre
                <input name="job" defaultValue={selected.jobTitle ?? ''} />
              </label>
              <label>
                Service
                <select name="department" defaultValue={selected.departmentId ?? ''}>
                  <option value="">Sans service</option>
                  {organization.data?.departments.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fonction
                <select name="position" defaultValue={selected.positionId ?? ''}>
                  <option value="">Sans fonction</option>
                  {organization.data?.positions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Supérieur
                <select name="supervisor" defaultValue={selected.supervisorId ?? ''}>
                  <option value="">Direction</option>
                  {members
                    .filter((x) => x.id !== selected.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.fullName}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Contrat
                <select name="employment" defaultValue={selected.employmentType ?? ''}>
                  <option value="">À définir</option>
                  {Object.entries(employmentLabel).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Statut
                <select name="status" defaultValue={selected.status}>
                  {Object.entries(statusLabel).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date d’embauche
                <input name="hired" type="date" defaultValue={selected.hiredAt ?? ''} />
              </label>
              <label>
                Fin du contrat
                <input name="end" type="date" defaultValue={selected.contractEnd ?? ''} />
              </label>
              <label>
                Charge hebdomadaire
                <input
                  name="workload"
                  type="number"
                  min="0"
                  max="80"
                  defaultValue={selected.weeklyWorkload}
                />
              </label>
              <label>
                <input name="delegate" type="checkbox" defaultChecked={selected.isStaffDelegate} />{' '}
                Délégué du personnel
              </label>
              <footer>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setSelected(null)}
                >
                  Annuler
                </button>
                <button className="button-primary">Enregistrer</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
