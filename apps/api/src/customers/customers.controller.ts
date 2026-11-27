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
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type CreateCustomerResponse,
  type CustomerDetail,
  type CustomerListItem,
  type Paginated,
  type SearchResult,
  type WhatsappMessages,
  type WhatsappSentResponse,
  createCustomerSchema,
  customerListQuerySchema,
  searchQuerySchema,
  updateCustomerSchema,
  whatsappQuerySchema,
  whatsappSentSchema,
} from '@gearva/contracts';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { Roles } from '../auth/staff-access.decorators';
import { CustomersService } from './customers.service';
import { SearchService } from './search.service';
import { WhatsappService } from './whatsapp.service';

class CreateCustomerDto extends createZodDto(createCustomerSchema) {}
class UpdateCustomerDto extends createZodDto(updateCustomerSchema) {}
class SearchQueryDto extends createZodDto(searchQuerySchema) {}
class CustomerListQueryDto extends createZodDto(customerListQuerySchema) {}
class WhatsappQueryDto extends createZodDto(whatsappQuerySchema) {}
class WhatsappSentDto extends createZodDto(whatsappSentSchema) {}

/** Who may message customers on WhatsApp: as the reminder list (flow.md 1, 9.5). */
const MESSAGE_ROLES = ['OWNER', 'MANAGER', 'RECEPTIONIST'] as const;

/** flow.md 1: every staff role adds and edits customers. */
@Controller('v1/customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /** 201 for a new customer, 200 when this garage already has the phone (flow.md 13). */
  @Post()
  @Audit('customer.create', 'customer')
  async create(
    @Body() body: CreateCustomerDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateCustomerResponse> {
    const result = await this.customers.create(body);
    res.status(result.created ? 201 : 200);
    return result;
  }

  /** The customer list: every role (decision 2026-10-27), paginated, no export. */
  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  list(@Query() query: CustomerListQueryDto): Promise<Paginated<CustomerListItem>> {
    return this.customers.list(query);
  }

  @Get(':customerId')
  detail(@Param('customerId', ParseUUIDPipe) customerId: string): Promise<CustomerDetail> {
    return this.customers.detail(customerId);
  }

  @Patch(':customerId')
  @Audit('customer.update', 'customer')
  update(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: UpdateCustomerDto,
  ): Promise<CustomerDetail> {
    return this.customers.update(customerId, body);
  }

  /**
   * flow.md 2.4: "Invite to the app" (and "Send again"). Not for mechanics, who do not
   * manage customers' accounts. Each call sends an email, so it is limited per IP.
   */
  @Post(':customerId/app-invite')
  @Roles('OWNER', 'MANAGER', 'RECEPTIONIST')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Audit('customer.app_invite', 'customer')
  inviteToApp(@Param('customerId', ParseUUIDPipe) customerId: string): Promise<CustomerDetail> {
    return this.customers.inviteToApp(customerId);
  }

  /**
   * flow.md 9.7 (step 7.10): the ready WhatsApp messages for this customer, written in
   * their language. With a visit, also "car ready" and the invoice.
   */
  @Get(':customerId/whatsapp')
  @Roles(...MESSAGE_ROLES)
  whatsappMessages(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: WhatsappQueryDto,
  ): Promise<WhatsappMessages> {
    return this.whatsapp.messages(customerId, query.visitId);
  }

  /** Staff opened WhatsApp with one of them: a SENT WhatsApp row in the log. */
  @Post(':customerId/whatsapp-sent')
  @Roles(...MESSAGE_ROLES)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Audit('customer.whatsapp_message', 'customer')
  whatsappSent(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: WhatsappSentDto,
  ): Promise<WhatsappSentResponse> {
    return this.whatsapp.sent(customerId, body);
  }
}

/** flow.md 3.3: one search box for plate or phone. Paginated, and limited per IP. */
@Controller('v1/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  search(@Query() query: SearchQueryDto): Promise<Paginated<SearchResult>> {
    return this.searchService.search(query);
  }
}
