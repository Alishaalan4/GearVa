import {
  Body,
  Controller,
  Get,
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
  type Paginated,
  type SearchResult,
  createCustomerSchema,
  searchQuerySchema,
  updateCustomerSchema,
} from '@gearva/contracts';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { CustomersService } from './customers.service';
import { SearchService } from './search.service';

class CreateCustomerDto extends createZodDto(createCustomerSchema) {}
class UpdateCustomerDto extends createZodDto(updateCustomerSchema) {}
class SearchQueryDto extends createZodDto(searchQuerySchema) {}

/** flow.md 1: every staff role adds and edits customers. */
@Controller('v1/customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

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
