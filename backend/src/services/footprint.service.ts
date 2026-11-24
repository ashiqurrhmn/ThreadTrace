import { prisma } from '../db/prisma';
import { ProblemError } from '../errors/problemDetails';
import { AllocationMethod, getAllocationStrategy } from '../patterns/allocationStrategy';
import { FootprintRollupResult, FootprintRollupVisitor } from '../patterns/lineageVisitor';
import { ConfigService } from './config.service';
import { TraceService } from './trace.service';

export class FootprintService {
  static async calculateForLot(
    lotIdOrCode: string,
    overrideMethod?: AllocationMethod
  ): Promise<FootprintRollupResult> {
    const lot = await prisma.lot.findFirst({
      where: { OR: [{ id: lotIdOrCode }, { lotCode: lotIdOrCode }] },
    });

    if (!lot) {
      throw new ProblemError({
        status: 404,
        title: 'Lot Not Found',
        detail: `No lot found for '${lotIdOrCode}'.`,
      });
    }

    const method = overrideMethod ?? (await ConfigService.getAllocationMethod());
    const strategy = getAllocationStrategy(method);
    const rootNode = await TraceService.buildBackwardComposite(lot.id);

    const visitor = new FootprintRollupVisitor(strategy);
    rootNode.accept(visitor, 1.0);

    const pieceCount = lot.pieceCount ?? (lot.unit === 'PIECES' ? Math.round(lot.quantity) : Math.max(1, Math.round(lot.weightKg * 4)));
    return visitor.getResult(pieceCount);
  }
}
