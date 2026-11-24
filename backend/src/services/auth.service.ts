import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma';
import { ProblemError } from '../errors/problemDetails';
import { AuthUser, signAuthToken, UserRole } from '../middleware/auth.middleware';

export class AuthService {
  static async login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { brand: true },
    });

    if (!user) {
      throw new ProblemError({
        status: 401,
        title: 'Invalid Credentials',
        detail: 'No account found for the given email address.',
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new ProblemError({
        status: 401,
        title: 'Invalid Credentials',
        detail: 'Incorrect password.',
      });
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      brandId: user.brandId,
      brandCode: user.brand?.code ?? null,
    };

    return {
      token: signAuthToken(authUser),
      user: authUser,
    };
  }

  /**
   * Demo-mode instant role switcher for instructor live presentation.
   */
  static async demoSwitch(persona: 'AUDITOR' | 'FACTORY_ADMIN' | 'BRAND_NW' | 'BRAND_ES'): Promise<{
    token: string;
    user: AuthUser;
  }> {
    const emailMap: Record<typeof persona, string> = {
      AUDITOR: 'auditor@eu-compliance.org',
      FACTORY_ADMIN: 'admin@gazipurknit.bd',
      BRAND_NW: 'sourcing@nordicwear.se',
      BRAND_ES: 'sourcing@eurostyle.de',
    };

    const user = await prisma.user.findUnique({
      where: { email: emailMap[persona] },
      include: { brand: true },
    });

    if (!user) {
      throw new ProblemError({
        status: 404,
        title: 'Demo Account Not Seeded',
        detail: `Demo user ${emailMap[persona]} was not found. Please run seed-demo.ts.`,
      });
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      brandId: user.brandId,
      brandCode: user.brand?.code ?? null,
    };

    return {
      token: signAuthToken(authUser),
      user: authUser,
    };
  }

  static async listDemoAccounts() {
    const users = await prisma.user.findMany({
      include: { brand: true },
      orderBy: { role: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      brandId: u.brandId,
      brandCode: u.brand?.code ?? null,
      brandName: u.brand?.name ?? null,
    }));
  }
}
