export interface FeeCandidate {
  id: string;
  gradeLevelId: string | null;
  classId: string | null;
  studentCategoryId: string | null;
}

export interface FeeTarget {
  gradeLevelId: string | null;
  classId: string | null;
  studentCategoryId: string | null;
}

export class FeeConfigurationConflict extends Error {
  constructor(public readonly candidateIds: string[]) {
    super('Plusieurs structures tarifaires ont la même spécificité.');
  }
}

export function feeSpecificity(candidate: FeeCandidate): number {
  return (
    (candidate.classId ? 4 : 0) +
    (candidate.studentCategoryId ? 2 : 0) +
    (candidate.gradeLevelId ? 1 : 0)
  );
}

export function resolveApplicableFee<T extends FeeCandidate>(
  candidates: readonly T[],
  target: FeeTarget,
): T | null {
  const applicable = candidates.filter(
    (item) =>
      (!item.classId || item.classId === target.classId) &&
      (!item.gradeLevelId || item.gradeLevelId === target.gradeLevelId) &&
      (!item.studentCategoryId || item.studentCategoryId === target.studentCategoryId),
  );
  if (applicable.length === 0) return null;
  let bestScore = -1;
  let best: T[] = [];
  for (const item of applicable) {
    const score = feeSpecificity(item);
    if (score > bestScore) {
      bestScore = score;
      best = [item];
    } else if (score === bestScore) best.push(item);
  }
  if (best.length > 1) throw new FeeConfigurationConflict(best.map((item) => item.id));
  return best[0] ?? null;
}
