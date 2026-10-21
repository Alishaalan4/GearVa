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
} from '@nestjs/common';
import {
  type Paginated,
  type StaffItem,
  inviteStaffSchema,
  updateStaffSchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { Roles } from '../auth/staff-access.decorators';
import { PaginationQueryDto } from '../common/pagination';
import { UsersService } from './users.service';

class InviteStaffDto extends createZodDto(inviteStaffSchema) {}
class UpdateStaffDto extends createZodDto(updateStaffSchema) {}

/** flow.md 1: staff are managed by the OWNER only. */
@Controller('v1/users')
@Roles('OWNER')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: PaginationQueryDto): Promise<Paginated<StaffItem>> {
    return this.users.list(query);
  }

  @Post()
  @Audit('user.invite', 'user')
  invite(@Body() body: InviteStaffDto): Promise<StaffItem> {
    return this.users.invite(body);
  }

  @Patch(':userId')
  @Audit('user.update', 'user')
  update(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpdateStaffDto,
  ): Promise<StaffItem> {
    return this.users.update(userId, body);
  }

  @Post(':userId/invite')
  @HttpCode(HttpStatus.OK)
  @Audit('user.invite.resend', 'user')
  resendInvite(@Param('userId', ParseUUIDPipe) userId: string): Promise<StaffItem> {
    return this.users.resendInvite(userId);
  }

  @Post(':userId/password-reset')
  @HttpCode(HttpStatus.OK)
  @Audit('user.password_reset', 'user')
  passwordReset(@Param('userId', ParseUUIDPipe) userId: string): Promise<StaffItem> {
    return this.users.sendPasswordReset(userId);
  }
}
