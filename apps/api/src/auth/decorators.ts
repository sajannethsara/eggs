import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from 'shared';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  partyId: string;
  outletId: string | null;
  language: 'en' | 'si';
  canSuperviseDeliveries: boolean;
};

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
