/**
 * Observer Pattern (FR5, QA2): Decouples certificate expiry detection from
 * alert creation and automatic passport claim re-evaluation / cache refresh.
 */
export interface EvidenceExpiryEvent {
  evidenceId: string;
  certificateNumber: string;
  certTypeCode: string;
  claimTag: string | null;
  lotId: string | null;
  partyId: string | null;
  daysRemaining: number;
  kind: 'EXPIRING_SOON' | 'EXPIRED';
}

export type ExpiryObserverFn = (event: EvidenceExpiryEvent) => Promise<void>;

class ExpiryEventSubject {
  private readonly observers: Array<{ name: string; handler: ExpiryObserverFn }> = [];

  subscribe(name: string, handler: ExpiryObserverFn): void {
    if (this.observers.some((o) => o.name === name)) return;
    this.observers.push({ name, handler });
  }

  async notify(event: EvidenceExpiryEvent): Promise<void> {
    for (const observer of this.observers) {
      try {
        await observer.handler(event);
      } catch (err) {
        console.error(`[ExpiryObserver:${observer.name}] Failed processing event:`, err);
      }
    }
  }
}

export const expirySubject = new ExpiryEventSubject();
