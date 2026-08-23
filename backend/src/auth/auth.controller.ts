import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AuthService, RequestMeta } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

function extractMeta(req: Request): RequestMeta {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto.email, dto.password, extractMeta(req));
  }

  @Post('logout')
  async logout(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    await this.authService.logout(user.userId, extractMeta(req));
    return { loggedOut: true };
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  async refresh(@Req() req: Request & { user: { userId: string; refreshToken: string } }) {
    return this.authService.refresh(req.user.userId, req.user.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('accept-invitation')
  async acceptInvitation(@Body() dto: AcceptInvitationDto, @Req() req: Request) {
    return this.authService.acceptInvitation(dto.token, dto.password, extractMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    // Reponse generique volontaire (anti-enumeration des emails valides)
    return { message: 'Si cet email existe, un lien de reinitialisation a ete envoye.' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.authService.resetPassword(dto.token, dto.password, extractMeta(req));
    return { message: 'Mot de passe reinitialise avec succes.' };
  }

  @Post('change-password')
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    await this.authService.changePassword(user.userId, dto.currentPassword, dto.newPassword, extractMeta(req));
    return { message: 'Mot de passe modifie avec succes.' };
  }
}
