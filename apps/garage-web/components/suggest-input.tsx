'use client';

import type { SuggestionField, SuggestionList } from '@gearva/contracts';
import { Input } from '@gearva/ui';
import { useQuery } from '@tanstack/react-query';
import { type InputHTMLAttributes, type Ref, useId, useState } from 'react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  field: SuggestionField;
  ref?: Ref<HTMLInputElement>;
};

/**
 * A text input with the garage's own autocomplete (flow.md 4.3), as a native datalist:
 * light, and works with phone keyboards. Most-used values come first.
 */
export function SuggestInput({ field, onChange, ref, ...props }: Props) {
  const listId = useId();
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), 200);
  const suggestions = useQuery({
    queryKey: ['suggestions', field, q],
    queryFn: () => api<SuggestionList>(`/v1/suggestions?field=${field}&q=${encodeURIComponent(q)}`),
    staleTime: 60_000,
  });

  return (
    <>
      <Input
        ref={ref}
        list={listId}
        autoComplete="off"
        onChange={(event) => {
          setText(event.target.value);
          onChange?.(event);
        }}
        {...props}
      />
      <datalist id={listId}>
        {suggestions.data?.items.map((s) => (
          <option key={s.value} value={s.value} />
        ))}
      </datalist>
    </>
  );
}
