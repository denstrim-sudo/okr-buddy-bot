## Цель

Перевести все AI-вызовы ассистента на внешний OpenAI-совместимый шлюз **AIAI.BY** (`https://vedai.by/api/v1`), сохранив текущий UI, маршруты и поведение. Ключ хранится только в Supabase secrets, фронтенд его не видит.

## Что НЕ меняется

- UI/маршруты/состояние/формы — без изменений.
- Контракты Edge Functions (`generate-okr`, `validate-okr`, `generate-solutions`, `validate-solution`, `ai-assistant`) — без изменений, фронтенд продолжит звать их через `supabase.functions.invoke(...)`.
- Структуры JSON-ответов и tool-calling — сохраняются.

## Что меняется (минимально)

### 1. `supabase/functions/_shared/ai.ts`
- Заменить базовый URL и переменную окружения:
  - URL: `https://vedai.by/api/v1/chat/completions` (берётся из `AIAI_BASE_URL`, fallback — этот URL).
  - Ключ: `AIAI_API_KEY` (с fallback на старый `OPENAI_API_KEY` для обратной совместимости).
- Default model: `gpt-4o-mini` (поддерживается AIAI.BY, можно переопределить через `systemConfig.model`).
- Сообщения об ошибках: «Не удалось связаться с AIAI.BY», «Неверный AIAI_API_KEY», «Лимит AIAI.BY», «На счёте AIAI.BY закончились средства» — дружелюбные русские тексты.
- Обновить шапку файла-комментария: `AIAI.BY — OpenAI-compatible gateway (https://aiai.by/docs)`.

### 2. `supabase/functions/ai-assistant/index.ts`
- Только обновить комментарий-документацию: указать, что используется AIAI.BY и какие модели валидны (`gpt-4o`, `gpt-4o-mini`, `claude-*`, `gemini-*`, `deepseek-*`).
- Логика, режимы, схема запроса/ответа — без изменений (`mode`, `userInput`, `context`, `systemConfig` → `{ result, rawModelResponse, usage, error }`).

### 3. Секрет
- Добавить в Lovable Cloud → Secrets новый секрет **`AIAI_API_KEY`** (через защищённый ввод в чате). Получить ключ можно на https://aiai.by/contact (Telegram @ai_minsk).
- Опционально: `AIAI_BASE_URL` (если когда-нибудь сменится домен) — по умолчанию `https://vedai.by/api/v1`.
- `OPENAI_API_KEY` остаётся как fallback, можно потом удалить.

## Поток данных (без изменений)

```text
UI кнопка ──► supabase.functions.invoke('ai-assistant' | 'generate-okr' | …)
                       │
                       ▼
          Edge Function (Supabase, Deno)
                       │  Authorization: Bearer ${AIAI_API_KEY}
                       ▼
          https://vedai.by/api/v1/chat/completions
          (tool_choice forced → strict JSON)
                       │
                       ▼
          { result, rawModelResponse, usage, error }
```

## Обработка ошибок (дружелюбная)

| Код | Текст пользователю |
|---|---|
| 401 | «Неверный AIAI_API_KEY — проверьте секрет в Cloud → Secrets.» |
| 402 | «На счёте AIAI.BY закончились средства. Пополните баланс.» |
| 429 | «Слишком много запросов к AIAI.BY. Подождите несколько секунд и попробуйте снова.» |
| timeout | «Запрос к AI занял слишком много времени.» |
| network | «Не удалось связаться с AIAI.BY.» |
| invalid_json | авто-ретрай (1 раз) с подсказкой модели вернуть строгий JSON. |

## Шаги выполнения

1. Запросить через защищённое поле ввода секрет **`AIAI_API_KEY`** (ты вставляешь ключ от AIAI.BY).
2. Обновить `supabase/functions/_shared/ai.ts` (URL + env + сообщения).
3. Обновить doc-комментарий в `supabase/functions/ai-assistant/index.ts`.
4. Задеплоить функции: `ai-assistant`, `generate-okr`, `validate-okr`, `generate-solutions`, `validate-solution`.
5. Проверить «Сгенерировать OKR» в UI — фронтенд не трогаем.

Подтверди план — и я сразу выведу secure-поле ввода для `AIAI_API_KEY` и применю изменения.