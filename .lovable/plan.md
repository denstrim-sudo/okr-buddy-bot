## Цель

Покрыть тестами каждый из трёх модулей OKR Copilot и их связку. Сейчас в проекте есть только `src/test/example.test.ts` и нулевое покрытие edge functions.

## Что тестируем

### Модуль 1 — OKR Generator
Edge functions: `interpret-okr-input`, `draft-okr`. UI: `OkrGenerator.tsx`.

- **Edge (Deno, реальный AI вызов через `_shared/ai.ts`)**
  - `interpret-okr-input`: на сыром тексте про годовую цель возвращает `detected_horizon=block_12m`, `detected_mode=from_scratch`, ≥1 `clarifying_questions`.
  - `interpret-okr-input`: при вставленном готовом OKR (`Objective: ... KR1: ...`) возвращает `detected_mode=rewrite_existing`, `parsed_existing.objective` непустой.
  - `draft-okr`: возвращает ровно 1 objective, ≤3 KR, у каждого KR `is_outcome=true`, заполнен `horizon_fit` с `overall_score 0..100`.
  - `draft-okr` с `focus_horizon_fit=true` + `prior_horizon_fit` отдаёт изменённые формулировки KR.
  - Валидация входа: `raw_input=""` → 400.

- **UI (Vitest + RTL, мок `supabase.functions.invoke`)**
  - `OkrGenerator` фаза `input → interpreting → clarify`: при ответе с `clarifying_questions.length>0` появляются textarea для ответов.
  - Фаза `clarify → drafting → draft_ready`: появляются бейдж «Соответствие горизонту X/100», `HorizonNote` под objective и KR.
  - Кнопка «Применить предложение» подставляет `suggestion` в текст KR без сетевого вызова.
  - Кнопка «Перегенерировать с акцентом на горизонт» вызывает `draft-okr` с `focus_horizon_fit:true` и `prior_horizon_fit`.
  - Кнопка «Передать в аудит» вызывает `onGenerated` с корректно собранным `GeneratedPlan` (адаптер `draftToGeneratedPlan`).

### Модуль 2 — OKR Validator
Edge: `validate-okr`. UI: `OkrValidator.tsx`.

- **Edge**
  - На валидном OKR: `status="pass"`, `score≥70`, `rules` непустой, каждое правило содержит `pass:boolean`.
  - На «activity-KR» («Запустить лендинг»): хотя бы одно правило с `pass=false` и `status≠"pass"`.
  - Возвращает `rewritten_objective` и `rewritten_key_results.length === input.length`.

- **UI**
  - При получении `draft` через props автоматически заполняются поля.
  - Кнопка «Проверить» рендерит `RuleList` со всеми правилами; статусные цвета соответствуют `pass/warn/fail`.
  - Кнопка «В Solution Studio» вызывает `onSendToSolutions(objective, krs)`.

### Модуль 3 — Solution Studio
Edge: `generate-solutions`, `validate-solution`. UI: `SolutionStudio.tsx`, hook `useSolutionStudio.ts`.

- **Edge**
  - `generate-solutions`: возвращает массив `solutions`, у каждого заполнены `bet`, `result_image`, `leading_metric`, `confidence∈{Low,Medium,High}`, `effort∈{S,M,L,XL}`.
  - `validate-solution`: возвращает `score`, `rules`, `rewritten_solution` со всеми обязательными полями.

- **UI / hook**
  - `useSolutionStudio` пробрасывает `objective` (regression-тест предыдущего фикса) в payload.
  - При смене вкладки KR подгружаются соответствующие решения.

### Связка (integration)
Один тест прогоняет цепочку **в режиме мока** для скорости:
1. Рендерим `<Index />` с моками `supabase.functions.invoke`.
2. В `OkrGenerator` вводим текст → interpret → (ответы) → draft → «Передать в аудит».
3. Проверяем, что в `OkrValidator` подставился `objective_refined` и список KR из draft.
4. Жмём «Проверить» → «В Solution Studio».
5. Проверяем, что в `SolutionStudio` `defaultObjective` = тот же objective и `keyResults` совпадают.
6. Один happy-path edge-test с реальными вызовами: `interpret-okr-input → draft-okr → validate-okr → generate-solutions`, проверяем только что каждый этап вернул 200 и непустые ключевые поля (медленно, помечается как `slow`).

## Технические детали

**Frontend (`src/**/__tests__` или рядом с компонентом)**
- Vitest + jsdom уже настроены.
- Моки supabase: `vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }))`. Каждый тест задаёт нужный ответ через `mockResolvedValueOnce`.
- Заворачиваем рендер в `ModelProvider` и `DocsProvider` (из `src/contexts/...`).

**Edge (`supabase/functions/<name>/index.test.ts`)**
- `import "https://deno.land/std@0.224.0/dotenv/load.ts"` — для `LOVABLE_API_KEY`.
- Тестируем через локальный `Deno.serve` handler: импортируем `index.ts` динамически и `fetch`-аем по `http://localhost:<port>` либо вызываем экспортированный handler. Если handler не экспортирован — небольшой рефактор: вынести `handler` отдельно и `Deno.serve(handler)` оставить в файле. Это единственная правка прод-кода ради тестируемости.
- Помечаем тесты, делающие реальный AI вызов, как `Deno.test({ name, ignore: !Deno.env.get("RUN_AI_TESTS") })` — по умолчанию пропускаются, чтобы не жечь кредиты на каждом прогоне. CI/локальный запуск — с флагом.
- Быстрые тесты (валидация входа, форма ответа на моке `fetch`) — без флага.

**Запуск**
- Frontend: `bunx vitest run` (через `lovable-exec test`).
- Edge: `supabase--test_edge_functions` для всех функций; AI-тесты — отдельным проходом с `RUN_AI_TESTS=1`.

## Файлы

Новые:
- `src/components/aimbot/__tests__/OkrGenerator.test.tsx`
- `src/components/aimbot/__tests__/OkrValidator.test.tsx`
- `src/components/aimbot/__tests__/SolutionStudio.test.tsx`
- `src/hooks/__tests__/useSolutionStudio.test.ts`
- `src/pages/__tests__/Index.integration.test.tsx`
- `supabase/functions/interpret-okr-input/index.test.ts`
- `supabase/functions/draft-okr/index.test.ts`
- `supabase/functions/validate-okr/index.test.ts`
- `supabase/functions/generate-solutions/index.test.ts`
- `supabase/functions/validate-solution/index.test.ts`
- `src/test/utils.tsx` — обёртки `renderWithProviders`, фикстуры `OkrDraft`/`GeneratedPlan`.

Минимальные правки в проде (только ради тестируемости, поведения не меняют):
- В каждом `supabase/functions/*/index.ts` экспортировать `handler` и оставить `Deno.serve(handler)`.

## Что не делаем

- Не покрываем UI shadcn-компонентов.
- Не пишем e2e через браузер — этого достаточно integration-теста на jsdom.
- Не трогаем `generate-okr` (deprecated).

## Открытые вопросы

1. Запускать ли AI-тесты (реальные вызовы Lovable AI) по умолчанию или только под флагом `RUN_AI_TESTS=1`? Рекомендую — под флагом, чтобы не жечь кредиты.
2. Делать ли integration-тест **только на моках** (быстро, детерминированно) или дублировать ещё и реальной цепочкой? Рекомендую — мок + один опциональный «smoke»-прогон под флагом.
3. ОК ли мини-рефактор `Deno.serve(handler)` → `export const handler; Deno.serve(handler)` в каждой edge-функции?
