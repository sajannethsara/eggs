import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { LoginInput, Role } from 'shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({ where: { username: input.username } });
    if (!user || !user.active || user.role !== input.role) {
      throw new UnauthorizedException('Wrong name, PIN or password');
    }
    const ok = await bcrypt.compare(input.secret, user.secretHash);
    if (!ok) throw new UnauthorizedException('Wrong name, PIN or password');

    const token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { token, user: this.toDto(user) };
  }

  /** Names shown on the role sign-in screen so a cashier can tap their name instead of typing. */
  async usersForRole(role: Role) {
    const users = await this.prisma.user.findMany({
      where: { role, active: true },
      select: { username: true, displayName: true, outlet: { select: { name: true } } },
      orderBy: { displayName: 'asc' },
    });
    return users.map((u) => ({
      username: u.username,
      displayName: u.displayName,
      outletName: u.outlet?.name ?? null,
    }));
  }

  async setLanguage(userId: string, language: 'en' | 'si') {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { language } });
    return this.toDto(user);
  }

  toDto(user: {
    id: string;
    username: string;
    displayName: string;
    role: Role;
    partyId: string;
    outletId: string | null;
    language: 'en' | 'si';
    canSuperviseDeliveries: boolean;
  }) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      partyId: user.partyId,
      outletId: user.outletId,
      language: user.language,
      canSuperviseDeliveries: user.canSuperviseDeliveries,
    };
  }
}
