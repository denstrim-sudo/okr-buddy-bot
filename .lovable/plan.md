## Смена модели AIAI.BY по умолчанию

Изменить одну строку в `supabase/functions/_shared/ai.ts`:

```ts
const DEFAULT_MODEL = "gpt-4o-mini";
```

на выбранную модель.

### Какую модель поставить?

Популярные варианты на AIAI.BY:
- `gpt-4o` — сильнее `gpt-4o-mini`, дороже
- `gpt-4.1` / `gpt-4.1-mini` — свежее поколение OpenAI
- `claude-3-5-sonnet` — отличное качество для текста/аудита
- `gemini-2.5-pro` — большой контекст
- `deepseek-chat` — дешёвый

Уточни, какую ставим — и я заменю значение и задеплою функции `ai-assistant`, `generate-okr`, `validate-okr`, `generate-solutions`, `validate-solution` (все используют общий `_shared/ai.ts`).

Дополнительно (опционально): можно также поднять `DEFAULT_MAX_TOKENS` или сменить `DEFAULT_TEMPERATURE`, если хочешь — скажи значения.