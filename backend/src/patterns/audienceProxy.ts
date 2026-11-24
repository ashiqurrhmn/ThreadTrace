import { UserRole } from '../middleware/auth.middleware';
import { CachedPassportEntry } from '../ports/cache.port';
import { PassportPayload } from './passportBuilder';

/**
 * Confidential fields that MUST NEVER appear in any public endpoint or passport page (FR8, QA3).
 */
export const CONFIDENTIAL_FIELD_NAMES = [
  'unitPriceUsd',
  'exactAddress',
  'workerCount',
  'contactEmail',
] as const;

export interface PartyRecord {
  id: string;
  code: string;
  name: string;
  type: string;
  country: string;
  city: string;
  exactAddress: string;
  workerCount: number;
  unitPriceUsd: number;
  contactEmail: string;
  metadata?: unknown;
  createdAt?: Date | string;
  productionLines?: unknown[];
}

/**
 * Proxy Pattern (FR8, QA3): Projects Party & Passport entities strictly according to audience role.
 */
export class AudienceProxy {
  static projectParty(party: PartyRecord, role: UserRole): Record<string, unknown> {
    if (role === 'AUDITOR' || role === 'FACTORY_ADMIN') {
      return { ...party };
    }
    if (role === 'BRAND_USER') {
      // Brand sees supplier identity & location details, but NOT internal factory wages/pricing/worker counts
      return {
        id: party.id,
        code: party.code,
        name: party.name,
        type: party.type,
        country: party.country,
        city: party.city,
        exactAddress: party.exactAddress,
        contactEmail: party.contactEmail,
        productionLines: party.productionLines,
      };
    }
    // PUBLIC: Strictly zero confidential fields
    return {
      id: party.id,
      code: party.code,
      name: party.name,
      type: party.type,
      country: party.country,
      city: party.city,
    };
  }

  static projectPassportForPublic(full: PassportPayload): Record<string, unknown> {
    return {
      passportCode: full.passportCode,
      version: full.version,
      styleCode: full.styleCode,
      shipmentRef: full.shipmentRef,
      brandName: full.brandName,
      brandCountry: full.brandCountry,
      lotCode: full.lotCode,
      materialType: full.materialType,
      fibreComposition: full.fibreComposition,
      verifiedClaims: full.verifiedClaims,
      originByProcessStep: full.originByProcessStep.map((s) => ({
        step: s.step,
        facilityName: s.facilityName,
        facilityType: s.facilityType,
        city: s.city,
        country: s.country,
        occurredAt: s.occurredAt,
      })),
      certifications: full.certifications,
      footprint: full.footprint,
      careAndRepair: full.careAndRepair,
      endOfLifeGuidance: full.endOfLifeGuidance,
      customFields: full.customFields,
      integrity: full.integrity,
      publishedAt: full.publishedAt,
    };
  }

  static projectPassportForBrand(full: PassportPayload): Record<string, unknown> {
    return {
      ...this.projectPassportForPublic(full),
      droppedClaimsNotice: full.droppedClaimsNotice ?? [],
      originByProcessStep: full.originByProcessStep.map((s) => ({
        step: s.step,
        facilityName: s.facilityName,
        facilityType: s.facilityType,
        city: s.city,
        country: s.country,
        exactAddress: s.exactAddress,
        contactEmail: s.contactEmail,
        occurredAt: s.occurredAt,
      })),
    };
  }

  static projectPassportForAuditor(full: PassportPayload): Record<string, unknown> {
    return {
      ...full,
      droppedClaimsNotice: full.droppedClaimsNotice ?? [],
    };
  }

  /**
   * Real-time expiry guard (QA4 + FR5): Even when served from cache while DB is down,
   * strip any certification or claim whose validUntil timestamp has passed.
   */
  static applyRealtimeExpiryFilter(
    entry: CachedPassportEntry,
    now: Date = new Date()
  ): Record<string, unknown> {
    const payload = JSON.parse(JSON.stringify(entry.publicPayload)) as Record<string, unknown>;
    const nowMs = now.getTime();

    const activeEvidenceIds = new Set<string>();
    const activeTags = new Set<string>();
    const expiredTags = new Set<string>();

    for (const ev of entry.evidenceSnapshot ?? []) {
      const valid = ev.status !== 'EXPIRED' && ev.status !== 'REVOKED' && new Date(ev.validUntil).getTime() > nowMs;
      if (valid) {
        activeEvidenceIds.add(ev.id);
        if (ev.claimTag) activeTags.add(ev.claimTag);
      } else if (ev.claimTag) {
        expiredTags.add(ev.claimTag);
      }
    }

    if (Array.isArray(payload.certifications)) {
      payload.certifications = (payload.certifications as Array<{ id: string; validUntil: string }>).filter(
        (c) => activeEvidenceIds.has(c.id) && new Date(c.validUntil).getTime() > nowMs
      );
    }

    const verifiedClaims = payload.verifiedClaims as
      | { organicPct: number; recycledPct: number; badges: string[] }
      | undefined;

    if (verifiedClaims) {
      if (expiredTags.has('ORGANIC') && !activeTags.has('ORGANIC')) {
        verifiedClaims.organicPct = 0;
        verifiedClaims.badges = (verifiedClaims.badges ?? []).filter((b) => !b.toUpperCase().includes('ORGANIC'));
      }
      if (expiredTags.has('RECYCLED') && !activeTags.has('RECYCLED')) {
        verifiedClaims.recycledPct = 0;
        verifiedClaims.badges = (verifiedClaims.badges ?? []).filter((b) => !b.toUpperCase().includes('RECYCLED'));
      }
    }

    return payload;
  }

  /**
   * Recursive confidentiality leak scanner (QA3).
   */
  static scanForConfidentialFields(obj: unknown, pathPrefix = '$'): string[] {
    const leaks: string[] = [];
    if (!obj || typeof obj !== 'object') return leaks;

    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => {
        leaks.push(...this.scanForConfidentialFields(item, `${pathPrefix}[${idx}]`));
      });
      return leaks;
    }

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const currentPath = `${pathPrefix}.${key}`;
      if ((CONFIDENTIAL_FIELD_NAMES as readonly string[]).includes(key)) {
        leaks.push(currentPath);
      }
      if (value && typeof value === 'object') {
        leaks.push(...this.scanForConfidentialFields(value, currentPath));
      }
    }
    return leaks;
  }
}
