import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { LoginSchema, RoleSchema, type LoginInput } from 'shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, Public, type AuthUser } from './decorators.js';

const LanguageSchema = z.object({ language: z.enum(['en', 'si']) });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body(new ZodPipe(LoginSchema)) body: LoginInput) {
    return this.auth.login(body);
  }

  /** Public so the sign-in screen can list names for a role before login. */
  @Public()
  @Get('roles/:role/users')
  usersForRole(@Param('role', new ZodPipe(RoleSchema)) role: z.infer<typeof RoleSchema>) {
    return this.auth.usersForRole(role);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Patch('me/language')
  setLanguage(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(LanguageSchema)) body: z.infer<typeof LanguageSchema>,
  ) {
    return this.auth.setLanguage(user.id, body.language);
  }
}
