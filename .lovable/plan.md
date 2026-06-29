# План: добавить горизонт «Квартал» (только в Модуль 1)

## Что меняем

### 1. Тип `OkrHorizon` (`src/types/okr.ts`)
Расширить: `"strategic_3y" | "block_12m" | "quarter_3m"`. Это центральная точка, от которой зависят и UI, и контракты Edge Functions, и тесты. Поле `HorizonFit.horizon` и `HorizonFitVerdict` остаются без изменений (`fits / too_short / too_long / mixed` корректно работают и для квартала).

### 2. UI Модуля 1 (`src/components/aimbot/OkrGenerator.tsx`)
- Добавить третью кнопку выбора горизонта: `Quarter · 3 мес` рядом с `Strategic · 3 года` и `Block · 12 мес`. Дефолт остаётся `block_12m` — не трогаем.
- В `horizonLabel`, в подписи drafted-плана и в баннере «Часть формулировок не укладывается в горизонт …» добавить ветку для `quarter_3m` ("3 мес").
- `verdictLabel` тоже расширить, чтобы тексты `too_long / too_short` читались под квартал ("слишком масштабно для 3 мес" и т.п.).
- Никакие другие модули (валидатор, студия решений) не трогаем — там горизонт не используется.

### 3. Edge Function `interpret-okr-input`
- В описание системы и в enum `detected_horizon` добавить `"quarter_3m"`.
- В нормализатор `horizonHint` принять три значения вместо двух (дефолт остаётся `block_12m`).
- В подсказке для модели описать критерий выбора: явные слова «квартал / Q1..Q4 / 3 месяца / до конца квартала» → `quarter_3m`; «год / 2026 / по итогам года» → `block_12m`; «3 года / 2028 / стратегия» → `strategic_3y`.

### 4. Edge Function `draft-okr`
- Расширить enum `horizon` и enum внутри `horizon_fit.horizon` / `horizon_fit.key_results[].* ` (там, где enum упоминает горизонт) до трёх значений.
- Дополнить guidance:
  - `quarter_3m`: фокус на одной фокус-теме квартала; KR — конкретные числовые исходы, достижимые за 3 месяца; запрещены годовые/многолетние формулировки («к 2028», «по итогам года»); baseline/target ставятся на 90 дней.
- В `userPrompt` нормализатор `h` теперь принимает три значения.

### 5. Тесты
- `supabase/functions/interpret-okr-input/index.test.ts`: разрешить `quarter_3m` в `assert([...].includes(data.detected_horizon))`, добавить кейс «Хочу за квартал поднять активацию» → ожидаем `quarter_3m`.
- `supabase/functions/draft-okr/index.test.ts`: добавить smoke-кейс с `horizon: "quarter_3m"`, проверить `data.horizon_fit.horizon === "quarter_3m"`.
- `src/components/aimbot/__tests__/OkrGenerator.test.tsx`: убедиться, что отрисовываются три кнопки горизонта; существующие проверки `block_12m` не трогаем.

### 6. Модуль 2 (аудит) — не трогаем код, а предлагаем уточнения правил
Ниже — предложение, которое мы либо реализуем отдельной итерацией, либо отложим. В рамках этой задачи **код Модуля 2 не меняем**.

Предлагаемые квартальные уточнения для `OKR_RULES_BLOCK` (когда `horizon === "quarter_3m"`):
- **O2-Q**: Objective явно умещается в один квартал (≤90 дней); запрещены формулировки «в течение года», «к 2028», «по итогам года».
- **KR2-Q**: target должен быть достижим за 3 месяца от baseline; если дельта явно требует >1 квартала (например, ×5 от текущего за квартал без обоснования) — important fail с подсказкой «разнесите на несколько кварталов или снизьте target».
- **KR4-Q**: время-граница KR не выходит за конец текущего квартала; формулировки вида «к Q4 следующего года» недопустимы.
- **KR10-Q (усиленное)**: для квартального OKR минимум один LEADING KR обязателен (severity повышается с important до critical), потому что за 3 месяца LAG-метрика часто не успевает сдвинуться.
- **Q-Focus (новое правило, important)**: квартальный OKR содержит ровно 1 Objective и 2–4 KR; больше — расфокусировка квартала.
- **Q-Theme (новое правило, improve)**: Objective связан с одной фокус-темой квартала, а не с разрозненным набором инициатив.

Эти правки требуют новой константы `OKR_RULES_BLOCK_QUARTER` и ветки выбора набора правил в `validate-okr` и `draft-okr` по `horizon`. Сделаем отдельным шагом — после подтверждения формулировок.

## Что НЕ трогаем
- Никакой код в `validate-okr`, `validate-solution`, `generate-solutions`, `SolutionStudio`, `OkrValidator`, `RuleList`.
- Дефолтный горизонт остаётся `block_12m`.
- Существующие правила `OKR_RULES_BLOCK` остаются без изменений.

## Проверка после реализации
- `bunx vitest run` — фронтовые тесты зелёные.
- `supabase--curl_edge_functions /interpret-okr-input` с `horizon: "quarter_3m"` → 200, `detected_horizon` приходит.
- `supabase--curl_edge_functions /draft-okr` с `horizon: "quarter_3m"` → 200, `horizon_fit.horizon === "quarter_3m"`.
- В UI выбор «Quarter · 3 мес» проходит сквозь Interpret → Clarify → Draft без ошибок.
