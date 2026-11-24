import { FootprintRollupResult } from './footprintTypes';

export interface PassportOriginStep {
  step: string;
  facilityName: string;
  facilityType: string;
  city: string;
  country: string;
  occurredAt: string;
  // Brand & Auditor only (stripped in Public projection via AudienceProxy)
  exactAddress?: string;
  contactEmail?: string;
  // Auditor only
  workerCount?: number;
  unitPriceUsd?: number;
}

export interface PassportCertificationItem {
  id: string;
  certificateNumber: string;
  certTypeCode: string;
  certTypeName: string;
  claimTag: string | null;
  issuer: string;
  scope: string;
  validUntil: string;
}

export interface PassportPayload {
  passportCode: string;
  version: number;
  styleCode: string;
  shipmentRef: string;
  brandName: string;
  brandCountry: string;
  lotCode: string;
  materialType: string;
  fibreComposition: Array<{ fibre: string; percent: number }>;
  verifiedClaims: {
    organicPct: number;
    recycledPct: number;
    badges: string[];
  };
  droppedClaimsNotice?: Array<{ claimTag: string; reason: string }>;
  originByProcessStep: PassportOriginStep[];
  certifications: PassportCertificationItem[];
  footprint: FootprintRollupResult;
  careAndRepair: Record<string, unknown>;
  endOfLifeGuidance: Record<string, unknown>;
  customFields: Record<string, unknown>;
  integrity: {
    verified: boolean;
    eventsChecked: number;
    integrityHash: string;
  };
  publishedAt: string;
}

/**
 * Builder Pattern (FR7, QA5): Decouples passport assembly & dynamic custom fields
 * from lineage traversal and mass-balance business logic.
 */
export class PassportBuilder {
  private payload: Partial<PassportPayload> = {
    fibreComposition: [],
    originByProcessStep: [],
    certifications: [],
    careAndRepair: {},
    endOfLifeGuidance: {},
    customFields: {},
  };

  setIdentity(meta: {
    passportCode: string;
    version: number;
    styleCode: string;
    shipmentRef: string;
    brandName: string;
    brandCountry: string;
    lotCode: string;
    materialType: string;
  }): this {
    Object.assign(this.payload, meta);
    return this;
  }

  setFibreComposition(composition: Array<{ fibre: string; percent: number }>): this {
    this.payload.fibreComposition = composition;
    return this;
  }

  setVerifiedClaims(claims: {
    organicPct: number;
    recycledPct: number;
    badges: string[];
    droppedClaims?: Array<{ claimTag: string; reason: string }>;
  }): this {
    this.payload.verifiedClaims = {
      organicPct: claims.organicPct,
      recycledPct: claims.recycledPct,
      badges: claims.badges,
    };
    if (claims.droppedClaims && claims.droppedClaims.length > 0) {
      this.payload.droppedClaimsNotice = claims.droppedClaims;
    }
    return this;
  }

  setOriginSteps(steps: PassportOriginStep[]): this {
    this.payload.originByProcessStep = steps;
    return this;
  }

  setCertifications(certs: PassportCertificationItem[]): this {
    this.payload.certifications = certs;
    return this;
  }

  setFootprint(footprint: FootprintRollupResult): this {
    this.payload.footprint = footprint;
    return this;
  }

  setCareAndEndOfLife(care: Record<string, unknown>, eol: Record<string, unknown>): this {
    this.payload.careAndRepair = care;
    this.payload.endOfLifeGuidance = eol;
    return this;
  }

  setCustomFields(
    configuredDefinitions: Array<{ key: string; label: string; defaultValue?: string }>,
    passportValues: Record<string, unknown>
  ): this {
    const merged: Record<string, unknown> = {};
    for (const def of configuredDefinitions) {
      merged[def.key] = {
        label: def.label,
        value: passportValues[def.key] ?? def.defaultValue ?? 'N/A',
      };
    }
    // Also retain any additional passport-specific custom keys
    for (const [k, v] of Object.entries(passportValues)) {
      if (!(k in merged)) {
        merged[k] = { label: k, value: v };
      }
    }
    this.payload.customFields = merged;
    return this;
  }

  setIntegrity(integrity: { verified: boolean; eventsChecked: number; integrityHash: string }): this {
    this.payload.integrity = integrity;
    return this;
  }

  build(): PassportPayload {
    return {
      ...(this.payload as PassportPayload),
      publishedAt: new Date().toISOString(),
    };
  }
}
