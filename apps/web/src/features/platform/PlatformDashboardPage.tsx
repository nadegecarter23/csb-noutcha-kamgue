import { useQuery } from '@tanstack/react-query';
import type { PlatformDashboardDto } from '@cplan/contracts';
import type { ReactNode } from 'react';
import { api } from '@/shared/api/client';

type Readiness = {
  status: 'ok' | 'degraded';
  checkedAt: string;
  dependencies: Array<{ name: string; status: 'up' | 'down'; latencyMs: number }>;
};

type IconName = 'people' | 'money' | 'attendance' | 'alert' | 'chart' | 'database' | 'clock';

const integer = new Intl.NumberFormat('fr-CM');
const money = new Intl.NumberFormat('fr-CM', {
  style: 'currency',
  currency: 'XAF',
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat('fr-CM', { dateStyle: 'medium', timeStyle: 'short' });
const unitColors: Record<string, string> = {
  CRECHE: '#16a36a',
  MATERNELLE: '#2878dc',
  PRIMAIRE: '#f08524',
  SECONDAIRE: '#7755c7',
};
const activityLabels: Record<string, string> = {
  'platform.test': 'Contrôle de la plateforme',
  'auth.login': 'Connexion utilisateur',
  'student.created': 'Nouvel élève enregistré',
  'payment.created': 'Paiement enregistré',
  'attendance.validated': 'Appel validé',
};

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    people: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    money: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M16 8.5c-.6-.9-1.7-1.5-3-1.5-1.7 0-3 1-3 2.3 0 3.5 6 1.8 6 5.2 0 1.4-1.4 2.5-3.2 2.5-1.4 0-2.7-.6-3.4-1.6M13 5v14" />
      </>
    ),
    attendance: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4M16 2v4M3 9h18M8 14l2.5 2.5L16 12" />
      </>
    ),
    alert: (
      <>
        <path d="M10.3 3.5 2.2 18a2 2 0 0 0 1.8 3h16a2 2 0 0 0 1.8-3L13.7 3.5a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      {paths[name]}
    </svg>
  );
}

function Progress({ value, color = '#16a36a' }: { value: number; color?: string }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <i
        className="block h-full rounded-full"
        style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }}
      />
    </span>
  );
}

function LoadingState() {
  return (
    <section className="space-y-5" aria-label="Chargement du cockpit">
      <div className="h-20 animate-pulse rounded-2xl bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
    </section>
  );
}

export function PlatformDashboardPage() {
  const dashboard = useQuery({
    queryKey: ['platform-dashboard'],
    queryFn: () => api.get<PlatformDashboardDto>('/platform/dashboard'),
    staleTime: 30_000,
  });
  const readiness = useQuery({
    queryKey: ['platform-readiness'],
    queryFn: () => api.get<Readiness>('/health/ready'),
    refetchInterval: 30_000,
  });

  if (dashboard.isPending) return <LoadingState />;
  if (dashboard.error || !dashboard.data)
    return (
      <section className="rounded-2xl border border-red-200 bg-white p-8 text-center">
        <p className="text-sm font-semibold text-red-700">Cockpit indisponible</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Les indicateurs n’ont pas pu être chargés.
        </h1>
        <button className="button-primary mt-5" onClick={() => void dashboard.refetch()}>
          Réessayer
        </button>
      </section>
    );

  const { summary, units, alerts, dataQuality, recentActivity, academicYear } = dashboard.data;
  const services = readiness.data?.dependencies ?? [];
  const collectedForRate = Math.max(0, summary.expectedAmount - summary.remainingAmount);
  const remainingRate = summary.expectedAmount > 0 ? 100 - summary.collectionRate : 0;
  const cards: Array<{ label: string; value: string; hint: string; icon: IconName; tone: string }> =
    [
      {
        label: 'Effectif total',
        value: integer.format(summary.activeStudents),
        hint: `${integer.format(summary.totalCapacity)} places configurées`,
        icon: 'people',
        tone: 'text-emerald-700 bg-emerald-50',
      },
      {
        label: 'Taux de recouvrement',
        value: `${summary.collectionRate.toLocaleString('fr-CM')} %`,
        hint: `${money.format(summary.remainingAmount)} restant`,
        icon: 'money',
        tone: 'text-orange-700 bg-orange-50',
      },
      {
        label: 'Présence observée',
        value:
          summary.attendanceRate === null
            ? '—'
            : `${summary.attendanceRate.toLocaleString('fr-CM')} %`,
        hint: summary.attendanceRate === null ? 'Aucun appel validé' : 'appels validés de l’année',
        icon: 'attendance',
        tone: 'text-blue-700 bg-blue-50',
      },
      {
        label: 'Alertes prioritaires',
        value: integer.format(summary.priorityAlerts),
        hint: `${alerts.length} catégorie(s) à traiter`,
        icon: 'alert',
        tone: summary.priorityAlerts ? 'text-red-700 bg-red-50' : 'text-emerald-700 bg-emerald-50',
      },
    ];

  return (
    <section className="mx-auto max-w-[1600px] space-y-5 pb-8" data-testid="platform-dashboard">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
            Pilotage du complexe
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">
            Vue consolidée de la crèche, de la maternelle, du primaire et du secondaire.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Icon name="attendance" />
          <div>
            <span className="block text-[11px] font-semibold text-slate-500">Année scolaire</span>
            <strong className="text-sm text-slate-900">{academicYear ?? 'Non configurée'}</strong>
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article
            key={card.label}
            className="flex min-h-28 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${card.tone}`}>
              <Icon name={card.icon} />
            </span>
            <div>
              <span className="text-xs font-semibold text-slate-500">{card.label}</span>
              <strong className="mt-1 block text-2xl font-extrabold tabular-nums text-slate-950">
                {card.value}
              </strong>
              <small className="mt-1 block text-xs text-slate-500">{card.hint}</small>
            </div>
          </article>
        ))}
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-slate-800">
              <Icon name="chart" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-950">Les quatre cycles</h2>
              <p className="text-xs text-slate-500">
                Comparaison des effectifs, de l’activité scolaire et du recouvrement
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-500">
            Données de l’année {academicYear ?? 'courante'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Cycle</th>
                <th>Élèves</th>
                <th className="w-36">Occupation</th>
                <th className="w-36">Présence</th>
                <th>Attendu</th>
                <th>Encaissé</th>
                <th>Reste</th>
                <th className="pr-5 text-center">Alertes</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr
                  key={unit.id}
                  className="border-t border-slate-100 transition-colors hover:bg-slate-50/70"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <i
                        className="h-8 w-1 rounded-full"
                        style={{ backgroundColor: unitColors[unit.code] }}
                      />
                      <div>
                        <strong className="block text-slate-900">{unit.name}</strong>
                        {dashboard.data.schools.length > 1 ? (
                          <small className="text-slate-500">{unit.schoolName}</small>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="font-bold tabular-nums text-slate-800">
                    {integer.format(unit.students)}
                  </td>
                  <td>
                    <div className="w-28">
                      <span className="mb-1.5 block text-xs font-bold tabular-nums text-slate-700">
                        {unit.occupancyRate.toLocaleString('fr-CM')} %
                      </span>
                      <Progress
                        value={unit.occupancyRate}
                        color={unitColors[unit.code] ?? '#16a36a'}
                      />
                    </div>
                  </td>
                  <td>
                    {unit.attendanceRate === null ? (
                      <span className="text-xs text-slate-400">Non observée</span>
                    ) : (
                      <div className="w-28">
                        <span className="mb-1.5 block text-xs font-bold tabular-nums text-slate-700">
                          {unit.attendanceRate.toLocaleString('fr-CM')} %
                        </span>
                        <Progress value={unit.attendanceRate} />
                      </div>
                    )}
                  </td>
                  <td className="tabular-nums text-slate-700">
                    {money.format(unit.expectedAmount)}
                  </td>
                  <td className="font-semibold tabular-nums text-slate-800">
                    {money.format(unit.collectedAmount)}
                  </td>
                  <td className="font-bold tabular-nums text-orange-700">
                    {money.format(unit.remainingAmount)}
                  </td>
                  <td className="pr-5 text-center">
                    <strong className={unit.alerts ? 'text-red-600' : 'text-emerald-600'}>
                      {unit.alerts}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!units.length ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              Aucun cycle actif n’est configuré.
            </p>
          ) : null}
        </div>
      </article>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <article className="self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Icon name="chart" />
            <div>
              <h2 className="text-lg font-bold text-slate-950">Situation financière globale</h2>
              <p className="text-xs text-slate-500">En FCFA · année {academicYear ?? 'courante'}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            <div>
              <span className="text-xs text-slate-500">Montant attendu</span>
              <strong className="mt-1 block text-2xl font-extrabold tabular-nums text-slate-950">
                {money.format(summary.expectedAmount)}
              </strong>
            </div>
            <div className="border-slate-200 sm:border-l sm:pl-5">
              <span className="text-xs text-slate-500">Montant encaissé</span>
              <strong className="mt-1 block text-2xl font-extrabold tabular-nums text-slate-950">
                {money.format(collectedForRate)}
              </strong>
            </div>
            <div className="border-slate-200 sm:border-l sm:pl-5">
              <span className="text-xs text-slate-500">Reste à recouvrer</span>
              <strong className="mt-1 block text-2xl font-extrabold tabular-nums text-orange-600">
                {money.format(summary.remainingAmount)}
              </strong>
            </div>
          </div>
          <div
            className="mt-7 flex h-10 overflow-hidden rounded-xl bg-slate-100"
            aria-label={`Recouvrement ${summary.collectionRate} pour cent`}
          >
            <span
              className="grid h-full place-items-center bg-emerald-600 text-xs font-bold text-white"
              style={{ width: `${summary.collectionRate}%` }}
            >
              {summary.collectionRate >= 12
                ? `${summary.collectionRate.toLocaleString('fr-CM')} %`
                : null}
            </span>
            <span
              className="grid h-full place-items-center bg-orange-400 text-xs font-bold text-white"
              style={{ width: `${remainingRate}%` }}
            >
              {remainingRate >= 12 ? `${remainingRate.toLocaleString('fr-CM')} %` : null}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-5 text-xs text-slate-600">
            <span className="flex items-center gap-2">
              <i className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
              Encaissé
            </span>
            <span className="flex items-center gap-2">
              <i className="h-2.5 w-2.5 rounded-full bg-orange-400" />
              Reste à recouvrer
            </span>
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">À traiter aujourd’hui</h2>
              <p className="text-xs text-slate-500">Priorités calculées à partir des données</p>
            </div>
            <strong className="text-sm text-red-600">{summary.priorityAlerts}</strong>
          </div>
          <div>
            {alerts.slice(0, 6).map((alert) => (
              <div
                key={alert.id}
                className="grid grid-cols-[4px_1fr_auto] gap-3 border-b border-slate-100 px-5 py-3 last:border-0"
              >
                <i
                  className={`h-full min-h-10 rounded-full ${alert.severity === 'CRITICAL' ? 'bg-red-500' : alert.severity === 'WARNING' ? 'bg-orange-400' : 'bg-blue-500'}`}
                />
                <div>
                  <strong className="block text-sm text-slate-800">{alert.title}</strong>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    {alert.detail}
                  </span>
                </div>
                <strong className="self-center tabular-nums text-slate-900">
                  {integer.format(alert.count)}
                </strong>
              </div>
            ))}
            {!alerts.length ? (
              <p className="px-5 py-10 text-center text-sm text-emerald-700">
                Aucune priorité ouverte.
              </p>
            ) : null}
          </div>
        </article>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-950">Qualité des données</h2>
          <p className="text-xs text-slate-500">Complétude et cohérence de l’année courante</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Quality label="Élèves avec responsable" value={dataQuality.guardianCoverage} />
          <Quality label="Classes configurées" value={dataQuality.classConfiguration} />
          <Quality label="Couverture pédagogique" value={dataQuality.teachingCoverage} />
          <Quality label="Frais attribués" value={dataQuality.feeCoverage} />
        </div>
      </article>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Icon name="database" />
              <div>
                <h2 className="text-base font-bold text-slate-950">Services opérationnels</h2>
                <p className="text-xs text-slate-500">
                  État technique, placé après les indicateurs métier
                </p>
              </div>
            </div>
            <span
              className={`text-xs font-bold ${readiness.data?.status === 'ok' ? 'text-emerald-700' : 'text-orange-700'}`}
            >
              {readiness.isPending
                ? 'Vérification…'
                : readiness.data?.status === 'ok'
                  ? 'Tous disponibles'
                  : 'Attention requise'}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {services.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <span className="flex items-center gap-2 text-sm font-semibold capitalize text-slate-700">
                  <i
                    className={`h-2.5 w-2.5 rounded-full ${service.status === 'up' ? 'bg-emerald-500' : 'bg-red-500'}`}
                  />
                  {service.name}
                </span>
                <small className="tabular-nums text-slate-500">{service.latencyMs} ms</small>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Icon name="clock" />
            <div>
              <h2 className="text-base font-bold text-slate-950">Activité récente</h2>
              <p className="text-xs text-slate-500">Dernières actions enregistrées</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {recentActivity.slice(0, 4).map((activity) => (
              <div key={activity.id} className="grid grid-cols-[8px_1fr_auto] items-start gap-3">
                <i className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                <div>
                  <strong className="block text-xs text-slate-800">
                    {activityLabels[activity.action] ?? activity.action}
                  </strong>
                  <span className="text-[11px] text-slate-500">
                    {activity.actorName ?? 'Système'} · {activity.schoolName ?? 'Plateforme'}
                  </span>
                </div>
                <time className="text-[11px] text-slate-400">
                  {dateTime.format(new Date(activity.createdAt))}
                </time>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function Quality({
  label,
  value,
}: {
  label: string;
  value: { complete: number; total: number; rate: number };
}) {
  const color = value.rate >= 90 ? '#16a36a' : value.rate >= 60 ? '#f08524' : '#dc4d4d';
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <div className="mt-2 flex items-end justify-between gap-3">
        <strong className="text-xl font-extrabold tabular-nums text-slate-950">
          {integer.format(value.complete)} / {integer.format(value.total)}
        </strong>
        <small className="font-bold tabular-nums" style={{ color }}>
          {value.rate.toLocaleString('fr-CM')} %
        </small>
      </div>
      <div className="mt-3">
        <Progress value={value.rate} color={color} />
      </div>
    </div>
  );
}
