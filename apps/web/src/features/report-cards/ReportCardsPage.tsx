import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  reportCardFileName,
  type AssessmentOverviewDto,
  type ClassDto,
  type ReportCardDto,
} from '@cplan/contracts';
import { api, downloadApiFile } from '@/shared/api/client';
import { useAcademicYear } from '@/features/academic/use-academic-year';
import { useAuthStore } from '@/features/auth/auth-store';

export function ReportCardsPage() {
  const academic = useAcademicYear();
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const yearId = academic.selectedYear?.id;
  const [classId, setClassId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<ReportCardDto | null>(null);
  const classes = useQuery({
    queryKey: ['classes', yearId],
    queryFn: () => api.get<ClassDto[]>(`/classes?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const assessment = useQuery({
    queryKey: ['assessment-overview', yearId],
    queryFn: () =>
      api.get<AssessmentOverviewDto>(`/assessments/overview?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const cards = useQuery({
    queryKey: ['report-cards', yearId, periodId, classId],
    queryFn: () =>
      api.get<ReportCardDto[]>(
        `/report-cards?academic_year_id=${yearId}&period_id=${periodId}${classId ? `&class_id=${classId}` : ''}`,
      ),
    enabled: Boolean(yearId && periodId),
  });
  const selected =
    draft ?? cards.data?.find((item) => item.id === selectedId) ?? cards.data?.[0] ?? null;
  const selectedPeriod = assessment.data?.periods.find((item) => item.id === periodId);
  useEffect(() => {
    if (!periodId && assessment.data?.periods[0]) setPeriodId(assessment.data.periods[0].id);
  }, [assessment.data, periodId]);
  useEffect(() => {
    if (!selectedId && cards.data?.[0]) setSelectedId(cards.data[0].id);
  }, [cards.data, selectedId]);
  useEffect(() => {
    setDraft(null);
    setSelectedId('');
  }, [classId, periodId]);
  const refresh = () => void client.invalidateQueries({ queryKey: ['report-cards'] });
  const generate = useMutation({
    mutationFn: () =>
      api.post('/report-cards/generate', { academicYearId: yearId, periodId, classId }),
    onSuccess: refresh,
  });
  const save = useMutation({
    mutationFn: (card: ReportCardDto) =>
      api.patch<ReportCardDto>(`/report-cards/${card.id}`, {
        generalComment: card.generalComment,
        decision: card.decision,
        subjectComments: card.subjects.map((subject) => ({
          subjectId: subject.subjectId,
          comment: subject.teacherComment,
        })),
      }),
    onSuccess: (data) => {
      setDraft(data);
      refresh();
    },
  });
  const publish = useMutation({
    mutationFn: () =>
      api.post<{ published: number }>('/report-cards/publish', {
        reportCardIds: (cards.data ?? [])
          .filter((item) => item.status === 'DRAFT')
          .map((item) => item.id),
      }),
    onSuccess: refresh,
  });
  const canGenerate = Boolean(user?.permissions.includes('report_cards.generate'));
  const canComment = Boolean(user?.permissions.includes('report_cards.comment'));
  const canPublish = Boolean(user?.permissions.includes('report_cards.publish'));
  if (!yearId)
    return (
      <section>
        <p>Sélectionnez une année scolaire.</p>
      </section>
    );
  return (
    <section className="report-cards-page">
      <header className="report-cards-header">
        <div>
          <h1>Bulletins scolaires</h1>
          <p>Calculez, relisez, publiez et imprimez les résultats de chaque période.</p>
          {selectedPeriod && selectedPeriod.status !== 'CLOSED' ? (
            <small>
              La publication sera disponible après le verrouillage des évaluations et la clôture de
              la période.
            </small>
          ) : null}
        </div>
        <div>
          {canGenerate ? (
            <button
              className="button-secondary"
              disabled={!classId || !periodId || generate.isPending}
              onClick={() => generate.mutate()}
            >
              Calculer la classe
            </button>
          ) : null}
          {canPublish ? (
            <button
              className="button-primary"
              disabled={
                selectedPeriod?.status !== 'CLOSED' ||
                !cards.data?.some((item) => item.status === 'DRAFT') ||
                publish.isPending
              }
              onClick={() => publish.mutate()}
            >
              Publier les brouillons
            </button>
          ) : null}
        </div>
      </header>
      <div className="report-card-filters">
        <label>
          Classe
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Sélectionner une classe</option>
            {classes.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Période
          <select value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
            {assessment.data?.periods.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <article>
          <strong>{cards.data?.length ?? 0}</strong>
          <span>bulletins</span>
        </article>
        <article>
          <strong>{cards.data?.filter((item) => item.status === 'PUBLISHED').length ?? 0}</strong>
          <span>publiés</span>
        </article>
      </div>
      <div className="report-cards-workspace">
        <aside>
          {cards.data?.map((card) => (
            <button
              key={card.id}
              className={selected?.id === card.id ? 'active' : ''}
              onClick={() => {
                setSelectedId(card.id);
                setDraft(null);
              }}
            >
              <span>
                <b>
                  {card.rank ? `${card.rank}. ` : ''}
                  {card.studentName}
                </b>
                <small>{card.studentNumber}</small>
              </span>
              <strong>{card.overallAverage?.toFixed(2) ?? '—'}</strong>
            </button>
          ))}
          {!cards.data?.length ? <p>Calculez les bulletins de la classe.</p> : null}
        </aside>
        <div className="report-card-detail">
          {selected ? (
            <>
              <header>
                <div>
                  <h2>{selected.studentName}</h2>
                  <p>
                    {selected.className} · {selected.periodName} · rang {selected.rank ?? '—'}
                  </p>
                </div>
                <div>
                  {canComment && selected.status === 'DRAFT' ? (
                    <button className="button-secondary" onClick={() => save.mutate(selected)}>
                      Enregistrer
                    </button>
                  ) : null}
                  <button
                    className="button-primary"
                    onClick={() =>
                      void downloadApiFile(
                        `/report-cards/${selected.id}/pdf`,
                        reportCardFileName(selected),
                      )
                    }
                  >
                    PDF
                  </button>
                </div>
              </header>
              <div className="report-card-average">
                <span>Moyenne générale</span>
                <strong>
                  {selected.overallAverage?.toFixed(2) ?? '—'}
                  <small>/20</small>
                </strong>
                <em className={selected.status.toLowerCase()}>
                  {selected.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'}
                </em>
              </div>
              <div className="report-subjects">
                <table>
                  <thead>
                    <tr>
                      <th>Matière</th>
                      <th>Moyenne</th>
                      <th>Coeff.</th>
                      <th>Appréciation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.subjects.map((subject) => (
                      <tr key={subject.subjectId}>
                        <td>{subject.subjectName}</td>
                        <td>
                          <strong>{subject.average?.toFixed(2) ?? '—'}</strong>
                        </td>
                        <td>{subject.coefficient}</td>
                        <td>
                          <input
                            disabled={!canComment || selected.status === 'PUBLISHED'}
                            value={subject.teacherComment ?? ''}
                            placeholder="Appréciation"
                            onChange={(event) =>
                              setDraft({
                                ...selected,
                                subjects: selected.subjects.map((item) =>
                                  item.subjectId === subject.subjectId
                                    ? { ...item, teacherComment: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="report-card-comments">
                <label>
                  Appréciation générale
                  <textarea
                    disabled={!canComment || selected.status === 'PUBLISHED'}
                    value={selected.generalComment ?? ''}
                    onChange={(event) =>
                      setDraft({ ...selected, generalComment: event.target.value })
                    }
                  />
                </label>
                <label>
                  Décision
                  <input
                    disabled={!canComment || selected.status === 'PUBLISHED'}
                    value={selected.decision ?? ''}
                    placeholder="Admis(e), encouragements…"
                    onChange={(event) => setDraft({ ...selected, decision: event.target.value })}
                  />
                </label>
              </div>
            </>
          ) : (
            <div className="attendance-empty">
              <strong>Aucun bulletin sélectionné</strong>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
