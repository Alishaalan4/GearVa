import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type AdminOwnerItem,
  type AdminStaffItem,
  type AdminUserItem,
  type Paginated,
  type SentLink,
  type SignedOut,
  adminOwnersQuerySchema,
  adminStaffQuerySchema,
  createAdminUserSchema,
  setAdminPasswordSchema,
  setUserPasswordSchema,
  updateAdminStaffSchema,
  updateAdminUserSchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../../audit/audit.decorator';
import { AdminGuard } from '../admin.guard';
import { AdminUsersService } from './admin-users.service';

class CreateAdminUserDto extends createZodDto(createAdminUserSchema) {}
class UpdateAdminUserDto extends createZodDto(updateAdminUserSchema) {}
class SetAdminPasswordDto extends createZodDto(setAdminPasswordSchema) {}
class AdminStaffQueryDto extends createZodDto(adminStaffQuerySchema) {}
class UpdateAdminStaffDto extends createZodDto(updateAdminStaffSchema) {}
class SetUserPasswordDto extends createZodDto(setUserPasswordSchema) {}
class AdminOwnersQueryDto extends createZodDto(adminOwnersQuerySchema) {}

/**
 * flow.md 11.8 (step 5.9): the super admin's Users page. Every handler is for super
 * admins only (checked in the service, FORBIDDEN otherwise).
 */
@Controller('admin/v1/users')
@UseGuards(AdminGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  // Admins

  @Get('admins')
  listAdmins(): Promise<AdminUserItem[]> {
    return this.users.listAdmins();
  }

  @Post('admins')
  @Audit('admin.users.admin.create', 'admin_user')
  createAdmin(@Body() body: CreateAdminUserDto): Promise<AdminUserItem> {
    return this.users.createAdmin(body);
  }

  @Patch('admins/:adminId')
  @Audit('admin.users.admin.update', 'admin_user')
  updateAdmin(
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Body() body: UpdateAdminUserDto,
  ): Promise<AdminUserItem> {
    return this.users.updateAdmin(adminId, body);
  }

  @Post('admins/:adminId/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit('admin.users.admin.password', 'admin_user')
  setAdminPassword(
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Body() body: SetAdminPasswordDto,
  ): Promise<void> {
    return this.users.setAdminPassword(adminId, body.password);
  }

  @Post('admins/:adminId/totp-reset')
  @HttpCode(HttpStatus.OK)
  @Audit('admin.users.admin.totp_reset', 'admin_user')
  resetAdminTotp(@Param('adminId', ParseUUIDPipe) adminId: string): Promise<AdminUserItem> {
    return this.users.resetAdminTotp(adminId);
  }

  @Post('admins/:adminId/sign-out')
  @HttpCode(HttpStatus.OK)
  @Audit('admin.users.admin.sign_out', 'admin_user')
  signOutAdmin(@Param('adminId', ParseUUIDPipe) adminId: string): Promise<SignedOut> {
    return this.users.signOutAdmin(adminId);
  }

  // Garage staff

  @Get('staff')
  listStaff(@Query() query: AdminStaffQueryDto): Promise<Paginated<AdminStaffItem>> {
    return this.users.listStaff(query);
  }

  @Post('staff/:userId/link')
  @HttpCode(HttpStatus.OK)
  @Audit('admin.users.staff.link', 'user')
  sendStaffLink(@Param('userId', ParseUUIDPipe) userId: string): Promise<SentLink> {
    return this.users.sendStaffLink(userId);
  }

  @Post('staff/:userId/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit('admin.users.staff.password', 'user')
  setStaffPassword(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: SetUserPasswordDto,
  ): Promise<void> {
    return this.users.setStaffPassword(userId, body.password);
  }

  @Post('staff/:userId/sign-out')
  @HttpCode(HttpStatus.OK)
  @Audit('admin.users.staff.sign_out', 'user')
  signOutStaff(@Param('userId', ParseUUIDPipe) userId: string): Promise<SignedOut> {
    return this.users.signOutStaff(userId);
  }

  @Patch('staff/:userId')
  @Audit('admin.users.staff.update', 'user')
  updateStaff(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpdateAdminStaffDto,
  ): Promise<AdminStaffItem> {
    return this.users.updateStaff(userId, body);
  }

  // Car owners

  @Get('owners')
  listOwners(@Query() query: AdminOwnersQueryDto): Promise<Paginated<AdminOwnerItem>> {
    return this.users.listOwners(query);
  }

  @Post('owners/:ownerId/link')
  @HttpCode(HttpStatus.OK)
  @Audit('admin.users.owner.link', 'owner')
  sendOwnerLink(@Param('ownerId', ParseUUIDPipe) ownerId: string): Promise<SentLink> {
    return this.users.sendOwnerLink(ownerId);
  }

  @Post('owners/:ownerId/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit('admin.users.owner.password', 'owner')
  setOwnerPassword(
    @Param('ownerId', ParseUUIDPipe) ownerId: string,
    @Body() body: SetUserPasswordDto,
  ): Promise<void> {
    return this.users.setOwnerPassword(ownerId, body.password);
  }

  @Post('owners/:ownerId/sign-out')
  @HttpCode(HttpStatus.OK)
  @Audit('admin.users.owner.sign_out', 'owner')
  signOutOwner(@Param('ownerId', ParseUUIDPipe) ownerId: string): Promise<SignedOut> {
    return this.users.signOutOwner(ownerId);
  }

  @Post('owners/:ownerId/close-account')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit('admin.users.owner.close', 'owner')
  closeOwnerAccount(@Param('ownerId', ParseUUIDPipe) ownerId: string): Promise<void> {
    return this.users.closeOwnerAccount(ownerId);
  }
}
