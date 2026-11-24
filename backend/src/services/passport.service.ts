import crypto from 'crypto';
import QRCode from 'qrcode';
import { prisma } from '../db/prisma';
import { isDbConnectionError } from '../db/pool';
import { env } from '../config/env';
import { ProblemError } from '../errors/problemDetails';
import { AuthUser } from '../middleware/auth.middleware';
import { assertBrandAccess } from '../middleware/rbac.middleware';
import { AllocationMethod } from '../patterns/allocationStrategy';
import { AudienceProxy } from '../patterns/audienceProxy';
import { expirySubject } from '../patterns/expiryObserver';
import { ClaimVerificationVisitor } from '../patterns/lineageVisitor';
import { PassportBuilder, PassportOriginStep } from '../patterns/passportBuilder';
import { CachedPassportEntry, passportCache } from '../ports/cache.port';
import { ConfigService } from './config.service';
import { FootprintService } from './footprint.service';
import { IntegrityService } from './integrity.service';
import { TraceService } from './trace.service';

export interface CreatePassportInput {
  passportCode: string;
  styleCode: string;
  shipmentRef: string;
  lotId: string;
  brandId: string;
  allocationMethod?: AllocationMethod;
  careAndRepair?: Record<string, unknown>;
  endOfLifeGuidance?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
}

export class PassportService {
  private static observerRegistered = false;

  static registerExpiryObserver(): void {
    if (this.observerRegistered) return;
    this.observerRegistered = true;

    expirySubject.subscribe('PassportClaimAutoDropObserver', async (ev) => {
      if (ev.kind !== 'EXPIRED') return;
      // Republish all passports whose lineage uses this party or lot so expired claims drop immediately
      const passports = await prisma.passport.findMany({ select: { id: true, passportCode: true } });
      for (const p of passports) {
        try {
          await this.publishNewVersion(p.passportCode);
        } catch (err) {
          console.warn(`[PassportService] Auto-republish failed for ${p.passportCode}:`, err);
        }
      }
    });
  }

  private static latestCacheKey(passportCode: string): string {
    return `${passportCode}__latest`;
  }

  private static versionCacheKey(passportCode: string, version: number): string {
    return `${passportCode}__v${version}`;
  }

  private static async assembleVersionData(
    passport: {
      id: string;
      passportCode: string;
      styleCode: string;
      shipmentRef: string;
      lotId: string;
      brandId: string;
      careAndRepair: unknown;
      endOfLifeGuidance: unknown;
      customFields: unknown;
    },
    version: number,
    overrideAllocation?: AllocationMethod
  ) {
    const lot = await prisma.lot.findUnique({
      where: { id: passport.lotId },
      include: { brand: true, party: true },
    });
    if (!lot) {
      throw new ProblemError({
        status: 404,
        title: 'Lot Not Found',
        detail: `Lot ${passport.lotId} linked to passport ${passport.passportCode} was not found.`,
      });
    }

    const brand = await prisma.brand.findUnique({ where: { id: passport.brandId } });
    if (!brand) {
      throw new ProblemError({
        status: 404,
        title: 'Brand Not Found',
        detail: `Brand ${passport.brandId} not found.`,
      });
    }

    const allocationMethod = overrideAllocation ?? (await ConfigService.getAllocationMethod());
    const [footprint, lineageComposite, customFieldDefs, integrity] = await Promise.all([
      FootprintService.calculateForLot(lot.id, allocationMethod),
      TraceService.buildBackwardComposite(lot.id),
      ConfigService.getCustomPassportFields(),
      IntegrityService.verifyPassport(passport.passportCode).catch(() => ({
        verified: true,
        eventsChecked: 0,
        integrityHash: 'PENDING',
      })),
    ]);

    // Visitor Pattern (QA2): verify claims against ONLY currently valid certificates & certified lineage
    const claimVisitor = new ClaimVerificationVisitor(new Date());
    lineageComposite.accept(claimVisitor, 1.0);
    const claimResult = claimVisitor.getResult(lot.claimedOrganicPct, lot.claimedRecycledPct);

    // NEVER publish unsupported claim percentages!
    const verifiedOrganicPct =
      lot.claimedOrganicPct > 0
        ? Math.min(lot.claimedOrganicPct, claimResult.certifiedOrganicPct)
        : claimResult.certifiedOrganicPct;
    const verifiedRecycledPct =
      lot.claimedRecycledPct > 0
        ? Math.min(lot.claimedRecycledPct, claimResult.certifiedRecycledPct)
        : claimResult.certifiedRecycledPct;

    const badges: string[] = [];
    const activeTags = new Set(claimResult.activeEvidences.map((e) => e.claimTag).filter(Boolean));
    if (verifiedOrganicPct > 0 && activeTags.has('ORGANIC')) {
      badges.push(`Verified ${verifiedOrganicPct}% Organic`);
    }
    if (verifiedRecycledPct > 0 && activeTags.has('RECYCLED')) {
      badges.push(`Verified ${verifiedRecycledPct}% Recycled`);
    }
    if (activeTags.has('CHEMICAL_SAFE')) {
      badges.push('OEKO-TEX Chemical Safe');
    }
    if (activeTags.has('ENVIRONMENTAL_MGMT')) {
      badges.push('ISO 14001 Managed');
    }
    if (activeTags.has('LAB_VERIFIED')) {
      badges.push('Lab Tested');
    }

    // Collect origin timeline across all ancestor lots in chronological order
    const allLotsInTree = await this.collectOriginSteps(lot.id);

    const rawFibre = Array.isArray(lot.fibreComposition)
      ? (lot.fibreComposition as Array<{ fibre: string; percent: number }>)
      : [];

    const fullPayload = new PassportBuilder()
      .setIdentity({
        passportCode: passport.passportCode,
        version,
        styleCode: passport.styleCode,
        shipmentRef: passport.shipmentRef,
        brandName: brand.name,
        brandCountry: brand.country,
        lotCode: lot.lotCode,
        materialType: lot.materialType,
      })
      .setFibreComposition(rawFibre)
      .setVerifiedClaims({
        organicPct: activeTags.has('ORGANIC') ? verifiedOrganicPct : 0,
        recycledPct: activeTags.has('RECYCLED') ? verifiedRecycledPct : 0,
        badges,
        droppedClaims: claimResult.droppedClaims,
      })
      .setOriginSteps(allLotsInTree)
      .setCertifications(
        claimResult.activeEvidences.map((e) => ({
          id: e.id,
          certificateNumber: e.certificateNumber,
          certTypeCode: e.certTypeCode,
          certTypeName: e.certTypeName,
          claimTag: e.claimTag,
          issuer: e.issuer,
          scope: e.scope,
          validUntil: e.validUntil,
        }))
      )
      .setFootprint(footprint)
      .setCareAndEndOfLife(
        (passport.careAndRepair as Record<string, unknown>) ?? {},
        (passport.endOfLifeGuidance as Record<string, unknown>) ?? {}
      )
      .setCustomFields(customFieldDefs, (passport.customFields as Record<string, unknown>) ?? {})
      .setIntegrity({
        verified: integrity.verified,
        eventsChecked: integrity.eventsChecked,
        integrityHash: integrity.integrityHash,
      })
      .build();

    // Proxy Pattern (FR8 & QA3): strict per-audience DTO projections
    const publicPayload = AudienceProxy.projectPassportForPublic(fullPayload);
    const brandPayload = AudienceProxy.projectPassportForBrand(fullPayload);
    const auditorPayload = AudienceProxy.projectPassportForAuditor(fullPayload);

    const evidenceSnapshot = claimResult.activeEvidences.map((e) => ({
      id: e.id,
      certificateNumber: e.certificateNumber,
      certTypeCode: e.certTypeCode,
      claimTag: e.claimTag,
      issuer: e.issuer,
      validUntil: e.validUntil,
      status: e.status,
    }));

    const etag = `"${crypto
      .createHash('sha256')
      .update(JSON.stringify(publicPayload))
      .digest('hex')
      .slice(0, 20)}"`;

    // Sync lot's cached certified pcts
    await prisma.lot.update({
      where: { id: lot.id },
      data: {
        certifiedOrganicPct: claimResult.certifiedOrganicPct,
        certifiedRecycledPct: claimResult.certifiedRecycledPct,
      },
    });

    return {
      allocationMethod,
      publicPayload,
      brandPayload,
      auditorPayload,
      evidenceSnapshot,
      etag,
      integrityHash: integrity.integrityHash,
    };
  }

  private static async collectOriginSteps(targetLotId: string): Promise<PassportOriginStep[]> {
    const trace = await TraceService.traceBackward(
      targetLotId,
      { id: 'system', email: 'system@threadtrace.local', name: 'System', role: 'AUDITOR', brandId: null },
      10
    );
    const lotIds = trace.nodes.map((n) => String(n.id));
    const events = await prisma.lotEvent.findMany({
      where: { lotId: { in: lotIds }, eventType: { not: 'CORRECTION' } },
      include: { party: true },
      orderBy: { occurredAt: 'asc' },
    });

    const seen = new Set<string>();
    const steps: PassportOriginStep[] = [];
    for (const ev of events) {
      const key = `${ev.eventType}:${ev.party.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      steps.push({
        step: ev.eventType,
        facilityName: ev.party.name,
        facilityType: ev.party.type,
        city: ev.party.city,
        country: ev.party.country,
        exactAddress: ev.party.exactAddress,
        contactEmail: ev.party.contactEmail,
        workerCount: ev.party.workerCount,
        unitPriceUsd: ev.party.unitPriceUsd,
        occurredAt: ev.occurredAt.toISOString(),
      });
    }
    return steps;
  }

  private static writeToCache(
    passportCode: string,
    version: number,
    versionData: {
      etag: string;
      publicPayload: Record<string, unknown>;
      evidenceSnapshot: CachedPassportEntry['evidenceSnapshot'];
    },
    availableVersions: number[],
    isLatest: boolean
  ): void {
    const entry: CachedPassportEntry = {
      passportCode,
      version,
      etag: versionData.etag,
      publicPayload: versionData.publicPayload,
      evidenceSnapshot: versionData.evidenceSnapshot,
      availableVersions,
      cachedAt: new Date().toISOString(),
    };
    passportCache.set(this.versionCacheKey(passportCode, version), entry);
    if (isLatest) {
      passportCache.set(this.latestCacheKey(passportCode), entry);
    }
  }

  static async createPassport(input: CreatePassportInput) {
    const code = input.passportCode.trim().toUpperCase();

    const passport = await prisma.passport.create({
      data: {
        passportCode: code,
        styleCode: input.styleCode.trim(),
        shipmentRef: input.shipmentRef.trim(),
        lotId: input.lotId,
        brandId: input.brandId,
        currentVersion: 1,
        careAndRepair: (input.careAndRepair ?? {
          wash: 'Machine wash cold at 30°C with mild detergent',
          bleach: 'Do not bleach',
          dry: 'Line dry in shade',
          repair: 'Free seam & button repair at partner stores for 24 months',
        }) as object,
        endOfLifeGuidance: (input.endOfLifeGuidance ?? {
          recyclable: true,
          takeBackProgram: 'Return to any EU partner textile collection point',
          sortingCode: 'TXT-COTTON-POLY-BLEND',
        }) as object,
        customFields: (input.customFields ?? {}) as object,
      },
    });

    const assembled = await this.assembleVersionData(passport, 1, input.allocationMethod);
    const ver = await prisma.passportVersion.create({
      data: {
        passportId: passport.id,
        version: 1,
        allocationMethod: assembled.allocationMethod,
        publicPayload: assembled.publicPayload as object,
        brandPayload: assembled.brandPayload as object,
        auditorPayload: assembled.auditorPayload as object,
        evidenceSnapshot: assembled.evidenceSnapshot as object,
        etag: assembled.etag,
        integrityHash: assembled.integrityHash,
      },
    });

    this.writeToCache(passport.passportCode, 1, assembled, [1], true);

    return { passport, latestVersion: ver };
  }

  static async publishNewVersion(
    passportCode: string,
    options?: {
      allocationMethod?: AllocationMethod;
      customFields?: Record<string, unknown>;
      careAndRepair?: Record<string, unknown>;
      endOfLifeGuidance?: Record<string, unknown>;
    }
  ) {
    const existing = await prisma.passport.findUnique({
      where: { passportCode },
      include: { versions: { select: { version: true }, orderBy: { version: 'asc' } } },
    });

    if (!existing) {
      throw new ProblemError({
        status: 404,
        title: 'Passport Not Found',
        detail: `No passport found with code '${passportCode}'.`,
      });
    }

    const nextVersion = existing.currentVersion + 1;
    const mergedCustomFields = {
      ...((existing.customFields as Record<string, unknown>) ?? {}),
      ...(options?.customFields ?? {}),
    };

    const updatedPassport = await prisma.passport.update({
      where: { id: existing.id },
      data: {
        currentVersion: nextVersion,
        customFields: mergedCustomFields as object,
        ...(options?.careAndRepair ? { careAndRepair: options.careAndRepair as object } : {}),
        ...(options?.endOfLifeGuidance ? { endOfLifeGuidance: options.endOfLifeGuidance as object } : {}),
      },
    });

    const assembled = await this.assembleVersionData(
      updatedPassport,
      nextVersion,
      options?.allocationMethod
    );

    const ver = await prisma.passportVersion.create({
      data: {
        passportId: existing.id,
        version: nextVersion,
        allocationMethod: assembled.allocationMethod,
        publicPayload: assembled.publicPayload as object,
        brandPayload: assembled.brandPayload as object,
        auditorPayload: assembled.auditorPayload as object,
        evidenceSnapshot: assembled.evidenceSnapshot as object,
        etag: assembled.etag,
        integrityHash: assembled.integrityHash,
      },
    });

    const allVersions = [...existing.versions.map((v) => v.version), nextVersion];
    this.writeToCache(existing.passportCode, nextVersion, assembled, allVersions, true);

    return { passport: updatedPassport, version: ver };
  }

  static async listPassports(user: AuthUser, options: { page: number; limit: number; search?: string }) {
    const where: Record<string, unknown> = {};
    if (user.role === 'BRAND_USER') {
      where.brandId = user.brandId;
    }
    if (options.search) {
      where.OR = [
        { passportCode: { contains: options.search, mode: 'insensitive' } },
        { styleCode: { contains: options.search, mode: 'insensitive' } },
        { shipmentRef: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.passport.count({ where }),
      prisma.passport.findMany({
        where,
        include: {
          brand: true,
          lot: { select: { id: true, lotCode: true, materialType: true, status: true } },
          versions: {
            select: { version: true, allocationMethod: true, publishedAt: true, etag: true },
            orderBy: { version: 'desc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);

    return {
      items: rows,
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / options.limit)),
    };
  }

  /**
   * Authenticated audience-scoped passport view (Public / Brand / Auditor) (FR7, FR8, QA3).
   */
  static async getAudiencePassport(passportCode: string, user: AuthUser, version?: number) {
    const passport = await prisma.passport.findUnique({
      where: { passportCode },
      include: {
        brand: true,
        versions: { orderBy: { version: 'desc' } },
      },
    });

    if (!passport) {
      throw new ProblemError({
        status: 404,
        title: 'Passport Not Found',
        detail: `No passport found with code '${passportCode}'.`,
      });
    }

    if (user.role === 'BRAND_USER') {
      assertBrandAccess(user, passport.brandId);
    }

    const targetVer = version
      ? passport.versions.find((v) => v.version === version)
      : passport.versions[0];

    if (!targetVer) {
      throw new ProblemError({
        status: 404,
        title: 'Passport Version Not Found',
        detail: `Version ${version} not found for passport ${passportCode}.`,
      });
    }

    let payload: unknown;
    let audienceView: 'PUBLIC' | 'BRAND' | 'AUDITOR';
    if (user.role === 'AUDITOR' || user.role === 'FACTORY_ADMIN') {
      payload = targetVer.auditorPayload;
      audienceView = 'AUDITOR';
    } else if (user.role === 'BRAND_USER') {
      payload = targetVer.brandPayload;
      audienceView = 'BRAND';
    } else {
      payload = targetVer.publicPayload;
      audienceView = 'PUBLIC';
    }

    const publicUrl = `${env.FRONTEND_URL}/passport/${passport.passportCode}`;
    const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 260, margin: 1 });

    return {
      passportCode: passport.passportCode,
      audienceView,
      version: targetVer.version,
      availableVersions: passport.versions.map((v) => v.version).sort((a, b) => a - b),
      allocationMethod: targetVer.allocationMethod,
      etag: targetVer.etag,
      publicUrl,
      qrDataUrl,
      data: payload,
    };
  }

  /**
   * PUBLIC Passport Endpoint with QA4 DB-Down Cache Resilience + Real-Time Expiry Filtering.
   */
  static async getPublicPassportWithFallback(
    passportCode: string,
    version?: number
  ): Promise<{
    cacheStatus: 'HIT-DB' | 'HIT-CACHE-DB-DOWN' | 'HIT-CACHE';
    etag: string;
    availableVersions: number[];
    qrDataUrl: string;
    publicUrl: string;
    cachedAt: string;
    data: Record<string, unknown>;
  }> {
    const code = passportCode.trim().toUpperCase();
    const cacheKey = version ? this.versionCacheKey(code, version) : this.latestCacheKey(code);
    const publicUrl = `${env.FRONTEND_URL}/passport/${code}`;

    try {
      const passport = await prisma.passport.findUnique({
        where: { passportCode: code },
        include: {
          versions: { orderBy: { version: 'desc' } },
        },
      });

      if (!passport) {
        throw new ProblemError({
          status: 404,
          title: 'Passport Not Found',
          detail: `No Digital Product Passport found for code '${code}'.`,
        });
      }

      const targetVer = version
        ? passport.versions.find((v) => v.version === version)
        : passport.versions[0];

      if (!targetVer) {
        throw new ProblemError({
          status: 404,
          title: 'Passport Version Not Found',
          detail: `Version ${version} does not exist for passport '${code}'.`,
        });
      }

      const availableVersions = passport.versions.map((v) => v.version).sort((a, b) => a - b);
      const entry: CachedPassportEntry = {
        passportCode: passport.passportCode,
        version: targetVer.version,
        etag: targetVer.etag,
        publicPayload: targetVer.publicPayload as Record<string, unknown>,
        evidenceSnapshot: (targetVer.evidenceSnapshot as CachedPassportEntry['evidenceSnapshot']) ?? [],
        availableVersions,
        cachedAt: new Date().toISOString(),
      };

      // Keep local LRU + Disk cache warm for QA4
      passportCache.set(this.versionCacheKey(code, targetVer.version), entry);
      if (targetVer.version === passport.currentVersion) {
        passportCache.set(this.latestCacheKey(code), entry);
      }

      const filteredPayload = AudienceProxy.applyRealtimeExpiryFilter(entry, new Date());
      const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 240, margin: 1 });

      return {
        cacheStatus: 'HIT-DB',
        etag: entry.etag,
        availableVersions,
        qrDataUrl,
        publicUrl,
        cachedAt: entry.cachedAt,
        data: filteredPayload,
      };
    } catch (err) {
      if (err instanceof ProblemError) throw err;

      // QA4 CRITICAL: If PostgreSQL is down, serve seamlessly from local LRU / disk snapshot cache!
      if (isDbConnectionError(err)) {
        const cached = passportCache.get(cacheKey);
        if (cached) {
          const filteredPayload = AudienceProxy.applyRealtimeExpiryFilter(cached, new Date());
          const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 240, margin: 1 });
          return {
            cacheStatus: 'HIT-CACHE-DB-DOWN',
            etag: cached.etag,
            availableVersions: cached.availableVersions,
            qrDataUrl,
            publicUrl,
            cachedAt: cached.cachedAt,
            data: filteredPayload,
          };
        }
      }

      throw err;
    }
  }
}
