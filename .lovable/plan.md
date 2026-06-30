## Диагноз

**«Видно только 2 модели»** — это клиентский фоллбек `FALLBACK_CATALOG` из `src/contexts/ModelContext.tsx`. Бэкенд `list-ai-models` сейчас работает и отдаёт все 20 моделей (проверил прямым вызовом). Значит при загрузке страницы вызов `supabase.functions.invoke("list-ai-models")` упал/таймнулся (вероятно — холодный старт edge-функции + загрузка `corsHeaders` с `esm.sh` под нагрузкой). После фоллбека повторных попыток нет — список так и остаётся из 2 строк до перезагрузки.

**«Ошибка edge function» в модуле 1** — текущий тост в `OkrGenerator` показывает generic-сообщение и не доносит реальный `data.error` из ответа функции (`AI-провайдер вернул ошибку…`, `Модель X недоступна`, `timeout`, и т.п.). Из-за этого нельзя понять, что именно произошло: упала ли модель, истёк ли таймаут или нет ключа.

## Что меняем (TDD, по проектным правилам)

### Фаза A. Стабилизировать каталог моделей

1. **Убрать зависимость от esm.sh** на горячем пути.
   - `supabase/functions/list-ai-models/index.ts` и `supabase/functions/_shared/ai.ts`: заменить `import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.105.1/cors"` на локальную константу:
     ```ts
     export const corsHeaders = {
       "Access-Control-Allow-Origin": "*",
       "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count",
     };
     ```
   - Один внешний CDN-импорт меньше → быстрее cold start, нет риска 503 от esm.sh.

2. **Сделать клиент устойчивым к одной осечке.** В `src/contexts/ModelContext.tsx`:
   - В `fetchModelCatalog` добавить один retry с задержкой 1200 мс, если первый вызов вернул `degraded:true` или попал в `catch`.
   - Существующий контракт (`{ models, degraded }`) и тесты сохраняем; добавляем новый кейс в `src/contexts/__tests__/ModelContext.test.tsx`: «первый invoke падает → второй успешен → возвращает полный каталог, не FALLBACK».

3. **Дать пользователю ручное восстановление.** В `src/components/aimbot/ModelSelector.tsx`:
   - Кнопка-иконка «Обновить список» рядом с селектом, дергает `refresh()`, который нужно экспонировать из `ModelContext` (`refresh: () => Promise<void>`).
   - Тест в `ModelSelector.test.tsx`: клик по кнопке вызывает `refresh` из контекста.

### Фаза B. Показать настоящую причину ошибки в модуле 1

4. **Прокидывать `data.error` наружу.** В `src/components/aimbot/OkrGenerator.tsx` (и идентично в обработчиках вызовов `interpret-okr-input` / `draft-okr` / `validate-okr` внутри генератора):
   - После `supabase.functions.invoke(...)` проверять не только `error`, но и `data?.error`. Если он есть — `toast.error(data.error)` вместо generic-строки.
   - Если ответ содержит `_meta.fallback_reason` с `model_unavailable` — мягкий `toast.warning` через уже существующий `notifyModelFallback` (вызов уже есть в части мест — добавить туда, где забыт).
   - Тест в `OkrGenerator.test.tsx`: мок invoke возвращает `{ data: { error: "Модель X недоступна" }, error: null }` → отображается ровно эта строка.

### Что НЕ трогаем
- AIAI-провайдер, выбор моделей, `_shared/ai.ts` fallback-логику, схемы edge-функций, скоринг, аудит-правила — всё остаётся как есть.
- `FALLBACK_CATALOG` оставляем как safety net на случай полного отказа бэкенда.

## Проверка
- `bunx vitest run` — все существующие тесты + 3 новых должны быть зелёными.
- `deno test` для edge-функций — без изменений ожиданий.
- Ручная проверка в preview: перезагрузить страницу → в селекторе ≥10 моделей; намеренно выбрать недоступную модель → в тосте видна точная причина из edge-функции.
