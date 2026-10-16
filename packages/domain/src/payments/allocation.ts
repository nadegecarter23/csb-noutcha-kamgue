export interface AllocationTarget {
  assignmentId: string;
  installmentId: string | null;
  remainingAmount: bigint;
  priority: number;
  dueDate: string | null;
  name: string;
  allowPartialPayment: boolean;
  enforceInstallmentOrder: boolean;
  priorInstallmentOpen?: boolean;
  opensAt?: string | null;
}

export interface ComputedAllocation {
  assignmentId: string;
  installmentId: string | null;
  amount: bigint;
}

export function sortAllocationTargets<T extends AllocationTarget>(targets: readonly T[]): T[] {
  return [...targets].sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') ||
      a.name.localeCompare(b.name, 'fr'),
  );
}

export function computeAllocations(
  amount: bigint,
  targets: readonly AllocationTarget[],
  today = new Date().toISOString().slice(0, 10),
): { allocations: ComputedAllocation[]; unallocatedAmount: bigint } {
  if (amount < 0n) throw new RangeError('Le montant à allouer doit être positif.');
  let remaining = amount;
  const allocations: ComputedAllocation[] = [];
  for (const target of sortAllocationTargets(targets)) {
    if (remaining === 0n) break;
    if (target.remainingAmount <= 0n || (target.opensAt && target.opensAt > today)) continue;
    if (target.enforceInstallmentOrder && target.priorInstallmentOpen) continue;
    const part = remaining < target.remainingAmount ? remaining : target.remainingAmount;
    if (!target.allowPartialPayment && part < target.remainingAmount) continue;
    allocations.push({
      assignmentId: target.assignmentId,
      installmentId: target.installmentId,
      amount: part,
    });
    remaining -= part;
  }
  return { allocations, unallocatedAmount: remaining };
}

export function validateManualAllocations(
  paymentAmount: bigint,
  requested: readonly ComputedAllocation[],
  targets: readonly AllocationTarget[],
): { allocations: ComputedAllocation[]; unallocatedAmount: bigint } {
  const byKey = new Map(
    targets.map((target) => [`${target.assignmentId}:${target.installmentId ?? ''}`, target]),
  );
  let allocated = 0n;
  for (const item of requested) {
    if (item.amount <= 0n) throw new RangeError("Le montant d'une allocation doit être positif.");
    const target = byKey.get(`${item.assignmentId}:${item.installmentId ?? ''}`);
    if (!target) throw new RangeError("La cible n'appartient pas au périmètre du paiement.");
    if (item.amount > target.remainingAmount)
      throw new RangeError('Allocation supérieure au reste dû.');
    allocated += item.amount;
  }
  if (allocated > paymentAmount) throw new RangeError('Allocations supérieures au paiement.');
  return { allocations: [...requested], unallocatedAmount: paymentAmount - allocated };
}
