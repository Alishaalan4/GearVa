import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustomersController, SearchController } from './customers.controller';
import { CustomersService } from './customers.service';
import { SearchService } from './search.service';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CustomersController, SearchController],
  providers: [CustomersService, SearchService, WhatsappService],
})
export class CustomersModule {}
