import { prisma } from '../db/prisma';
import { AuthUser } from '../middleware/auth.middleware';
import { AudienceProxy } from '../patterns/audienceProxy';
import { ProblemError } from '../errors/problemDetails';

export interface CreatePartyInput {
  code: string;
  name: string;
  type: string;
  country: string;
  city: string;
  exactAddress: string;
  workerCount: number;
  unitPriceUsd: number;
  contactEmail: string;
  metadata?: Record<string, unknown>;
}

export interface CreateProductionLineInput {
  code: string;
  name: string;
  partyId: string;
  processType: string;
  capacityPerDay: number;
}

export class PartyService {
  static async listBrands() {
    return prisma.brand.findMany({ orderBy: { name: 'asc' } });
  }

  static async listParties(
    user: AuthUser,
    options: { page: number; limit: number; type?: string; search?: string }
  ) {
    const where: Record<string, unknown> = {};
    if (options.type) where.type = options.type;
    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { code: { contains: options.search, mode: 'insensitive' } },
        { city: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.party.count({ where }),
      prisma.party.findMany({
        where,
        include: { productionLines: true },
        orderBy: { createdAt: 'asc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);

    return {
      items: rows.map((p) => AudienceProxy.projectParty(p, user.role)),
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / options.limit)),
    };
  }

  static async getPartyById(id: string, user: AuthUser) {
    const party = await prisma.party.findUnique({
      where: { id },
      include: { productionLines: true },
    });
    if (!party) {
      throw new ProblemError({
        status: 404,
        title: 'Party Not Found',
        detail: `No supplier or facility found with id ${id}.`,
      });
    }
    return AudienceProxy.projectParty(party, user.role);
  }

  static async createParty(input: CreatePartyInput) {
    return prisma.party.create({
      data: {
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        type: input.type.trim().toUpperCase(),
        country: input.country.trim(),
        city: input.city.trim(),
        exactAddress: input.exactAddress.trim(),
        workerCount: input.workerCount,
        unitPriceUsd: input.unitPriceUsd,
        contactEmail: input.contactEmail.trim(),
        metadata: (input.metadata ?? {}) as object,
      },
      include: { productionLines: true },
    });
  }

  static async createProductionLine(input: CreateProductionLineInput) {
    const factory = await prisma.party.findUnique({ where: { id: input.partyId } });
    if (!factory) {
      throw new ProblemError({
        status: 404,
        title: 'Facility Not Found',
        detail: `Party ${input.partyId} does not exist.`,
      });
    }

    return prisma.productionLine.create({
      data: {
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        partyId: input.partyId,
        processType: input.processType.trim().toUpperCase(),
        capacityPerDay: input.capacityPerDay,
      },
    });
  }

  static async listProductionLines(partyId?: string) {
    return prisma.productionLine.findMany({
      where: partyId ? { partyId } : undefined,
      include: {
        party: {
          select: { id: true, code: true, name: true, type: true, city: true, country: true },
        },
      },
      orderBy: { code: 'asc' },
    });
  }
}
