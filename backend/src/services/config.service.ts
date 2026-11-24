import { prisma } from '../db/prisma';
import {
  DEFAULT_CERT_TYPE_CONFIGS,
  DEFAULT_PROCESS_CONFIGS,
  DEFAULT_SYSTEM_SETTINGS,
} from '../config/defaults';
import { AllocationMethod } from '../patterns/allocationStrategy';

export interface CustomPassportFieldDef {
  key: string;
  label: string;
  defaultValue?: string;
}

export class ConfigService {
  static async ensureDefaults(): Promise<void> {
    for (const proc of DEFAULT_PROCESS_CONFIGS) {
      await prisma.processConfig.upsert({
        where: { code: proc.code },
        update: {},
        create: proc,
      });
    }
    for (const cert of DEFAULT_CERT_TYPE_CONFIGS) {
      await prisma.certificateTypeConfig.upsert({
        where: { code: cert.code },
        update: {},
        create: cert,
      });
    }
    for (const setting of DEFAULT_SYSTEM_SETTINGS) {
      await prisma.systemSetting.upsert({
        where: { key: setting.key },
        update: {},
        create: { key: setting.key, value: setting.value as object },
      });
    }
  }

  static async getAllConfig() {
    const [processConfigs, certTypes, settings] = await Promise.all([
      prisma.processConfig.findMany({ orderBy: { sequenceOrder: 'asc' } }),
      prisma.certificateTypeConfig.findMany({ orderBy: { code: 'asc' } }),
      prisma.systemSetting.findMany({ orderBy: { key: 'asc' } }),
    ]);

    const settingsMap: Record<string, unknown> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    return {
      processConfigs,
      certificateTypes: certTypes,
      settings: settingsMap,
    };
  }

  static async upsertProcessConfig(input: {
    code: string;
    label: string;
    sequenceOrder: number;
    maxLossPercent: number;
    enforcementMode: 'BLOCK' | 'FLAG';
    waterLitersPerKg: number;
    energyKwhPerKg: number;
    co2eKgPerKg: number;
    active?: boolean;
  }) {
    const code = input.code.trim().toUpperCase().replace(/\s+/g, '_');
    return prisma.processConfig.upsert({
      where: { code },
      update: {
        label: input.label,
        sequenceOrder: input.sequenceOrder,
        maxLossPercent: input.maxLossPercent,
        enforcementMode: input.enforcementMode,
        waterLitersPerKg: input.waterLitersPerKg,
        energyKwhPerKg: input.energyKwhPerKg,
        co2eKgPerKg: input.co2eKgPerKg,
        active: input.active ?? true,
      },
      create: {
        code,
        label: input.label,
        sequenceOrder: input.sequenceOrder,
        maxLossPercent: input.maxLossPercent,
        enforcementMode: input.enforcementMode,
        waterLitersPerKg: input.waterLitersPerKg,
        energyKwhPerKg: input.energyKwhPerKg,
        co2eKgPerKg: input.co2eKgPerKg,
        active: input.active ?? true,
      },
    });
  }

  static async upsertCertTypeConfig(input: {
    code: string;
    name: string;
    claimTag?: string | null;
    requiresFile?: boolean;
    defaultValidityDays?: number;
    active?: boolean;
  }) {
    const code = input.code.trim().toUpperCase().replace(/\s+/g, '_');
    return prisma.certificateTypeConfig.upsert({
      where: { code },
      update: {
        name: input.name,
        claimTag: input.claimTag ? input.claimTag.trim().toUpperCase() : null,
        requiresFile: input.requiresFile ?? true,
        defaultValidityDays: input.defaultValidityDays ?? 365,
        active: input.active ?? true,
      },
      create: {
        code,
        name: input.name,
        claimTag: input.claimTag ? input.claimTag.trim().toUpperCase() : null,
        requiresFile: input.requiresFile ?? true,
        defaultValidityDays: input.defaultValidityDays ?? 365,
        active: input.active ?? true,
      },
    });
  }

  static async getAllocationMethod(): Promise<AllocationMethod> {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'allocation_method' } });
    return setting?.value === 'PIECE_COUNT' ? 'PIECE_COUNT' : 'MASS';
  }

  static async setAllocationMethod(method: AllocationMethod) {
    return prisma.systemSetting.upsert({
      where: { key: 'allocation_method' },
      update: { value: method },
      create: { key: 'allocation_method', value: method },
    });
  }

  static async getExpiryAlertWindowDays(): Promise<number> {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'expiry_alert_window_days' } });
    const n = Number(setting?.value ?? 30);
    return Number.isFinite(n) && n > 0 ? n : 30;
  }

  static async getCustomPassportFields(): Promise<CustomPassportFieldDef[]> {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'passport_custom_fields' } });
    if (Array.isArray(setting?.value)) {
      return setting.value as unknown as CustomPassportFieldDef[];
    }
    return [];
  }

  static async setCustomPassportFields(fields: CustomPassportFieldDef[]) {
    return prisma.systemSetting.upsert({
      where: { key: 'passport_custom_fields' },
      update: { value: fields as unknown as object },
      create: { key: 'passport_custom_fields', value: fields as unknown as object },
    });
  }
}
