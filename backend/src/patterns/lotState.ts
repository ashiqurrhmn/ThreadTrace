/**
 * State Pattern (FR2): Governs valid lot lifecycle status transitions.
 */
export type LotStatus =
  | 'RECEIVED'
  | 'IN_PROCESS'
  | 'SPLIT'
  | 'MERGED'
  | 'COMPLETED'
  | 'SHIPPED'
  | 'QUARANTINED'
  | 'FLAGGED';

const ALLOWED_TRANSITIONS: Record<LotStatus, LotStatus[]> = {
  RECEIVED: ['IN_PROCESS', 'SPLIT', 'MERGED', 'COMPLETED', 'FLAGGED', 'QUARANTINED'],
  IN_PROCESS: ['IN_PROCESS', 'SPLIT', 'MERGED', 'COMPLETED', 'SHIPPED', 'FLAGGED', 'QUARANTINED'],
  SPLIT: ['SPLIT', 'IN_PROCESS', 'FLAGGED', 'QUARANTINED'],
  MERGED: ['IN_PROCESS', 'COMPLETED', 'SHIPPED', 'FLAGGED', 'QUARANTINED'],
  COMPLETED: ['SHIPPED', 'COMPLETED', 'FLAGGED', 'QUARANTINED'],
  SHIPPED: ['SHIPPED', 'FLAGGED', 'QUARANTINED'],
  FLAGGED: ['IN_PROCESS', 'COMPLETED', 'SHIPPED', 'QUARANTINED', 'FLAGGED'],
  QUARANTINED: ['IN_PROCESS', 'FLAGGED', 'QUARANTINED'],
};

export class LotStateMachine {
  static canTransition(from: LotStatus, to: LotStatus): boolean {
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
  }

  static resolveNextStatus(current: LotStatus, eventType: string, isFlagged: boolean): LotStatus {
    if (isFlagged) return 'FLAGGED';
    const upper = eventType.toUpperCase();
    if (upper === 'RECEIVE') return 'RECEIVED';
    if (upper === 'PACK') return 'COMPLETED';
    if (upper === 'SHIP') return 'SHIPPED';
    if (upper === 'CORRECTION') return current;
    return 'IN_PROCESS';
  }
}
