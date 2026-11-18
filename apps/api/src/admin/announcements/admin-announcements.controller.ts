import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type AnnouncementDetail,
  type AnnouncementItem,
  type Paginated,
  createAnnouncementSchema,
  paginationQuerySchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../../audit/audit.decorator';
import { AdminGuard } from '../admin.guard';
import { AdminAnnouncementsService } from './admin-announcements.service';

class CreateAnnouncementDto extends createZodDto(createAnnouncementSchema) {}
class AnnouncementsQueryDto extends createZodDto(paginationQuerySchema) {}

/** flow.md 11.9 (step 5.10): messages to garages. Super admins only. */
@Controller('admin/v1/announcements')
@UseGuards(AdminGuard)
export class AdminAnnouncementsController {
  constructor(private readonly announcements: AdminAnnouncementsService) {}

  @Get()
  list(@Query() query: AnnouncementsQueryDto): Promise<Paginated<AnnouncementItem>> {
    return this.announcements.list(query);
  }

  @Post()
  @Audit('admin.announcement.send', 'announcement')
  create(@Body() body: CreateAnnouncementDto): Promise<AnnouncementDetail> {
    return this.announcements.create(body);
  }

  @Get(':announcementId')
  get(@Param('announcementId', ParseUUIDPipe) announcementId: string): Promise<AnnouncementDetail> {
    return this.announcements.get(announcementId);
  }

  /** Takes the banner down everywhere now. */
  @Post(':announcementId/end')
  @HttpCode(HttpStatus.OK)
  @Audit('admin.announcement.end', 'announcement')
  end(@Param('announcementId', ParseUUIDPipe) announcementId: string): Promise<AnnouncementDetail> {
    return this.announcements.end(announcementId);
  }
}
