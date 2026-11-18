import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { GarageAnnouncement } from '@gearva/contracts';
import { Audit } from '../audit/audit.decorator';
import { AnnouncementsService } from './announcements.service';

/** flow.md 11.9: Gearva's messages, shown as banners to every staff member. */
@Controller('v1/announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  active(): Promise<GarageAnnouncement[]> {
    return this.announcements.active();
  }

  @Post(':announcementId/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit('announcement.dismiss', 'announcement')
  dismiss(@Param('announcementId', ParseUUIDPipe) announcementId: string): Promise<void> {
    return this.announcements.dismiss(announcementId);
  }
}
