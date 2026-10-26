import { Controller, Get, Query } from '@nestjs/common';
import { type SuggestionList, suggestionQuerySchema } from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { SuggestionsService } from './suggestions.service';

class SuggestionQueryDto extends createZodDto(suggestionQuerySchema) {}

/** flow.md 4.3: autocomplete for any signed-in staff member. */
@Controller('v1/suggestions')
export class SuggestionsController {
  constructor(private readonly suggestions: SuggestionsService) {}

  @Get()
  list(@Query() query: SuggestionQueryDto): Promise<SuggestionList> {
    return this.suggestions.list(query);
  }
}
