# Модуль 1: структурированное рассуждение и 2–3 варианта OKR в interpret-okr-input

Меняется только `supabase/functions/interpret-okr-input/`. Функции draft-okr, validate-okr и файл `_shared/okr_rules.ts` не трогаем. Все прежние поля ответа сохраняются.

## Шаг 1 (RED): чистые функции — `reasoning.ts` + `reasoning.test.ts`
Тесты на Deno, без AI:
- `extractDocNames(extra_context)` — разбирает блоки `--- имя ---` (тот же формат собирает контекст документов на фронтенде) и возвращает `["План 2026.docx","notes.txt"]`; для пустой строки или undefined — `[]`.
- `normalizeReasoning(reasoning, docNames)`:
  - факты с source `input` или `assumption` не меняются; `doc:<имя>` остаётся, только если документ с таким именем был загружен;
  - ссылка на неизвестный документ превращается в `assumption` + `source_unverified: true`;
  - из `supports_fact_ids` и `addresses_tension_ids` убираются несуществующие id; вариантов остаётся не больше 3;
  - возвращает `quality { variants_count, distinct_axes, unsupported_variant_ids }`.
- `ensureDistinctVariants(first, redo)` — устроена как `sanitizeRewrittenObjective`:
  - если оси различны и вариантов ≥2, redo не вызывается;
  - иначе redo вызывается ровно 1 раз, и его результат берём, только если он лучше;
  - если redo не помог или упал, оставляем first и ставим `reasoning_warning` = `variants_not_distinct` или `too_few_variants`.
- `REASONING_RULES` — константа с текстом блока REASONING (этап REFACTOR).

## Шаг 2 (GREEN): схема, промпт, handler
- В `PARAMETERS` поле `reasoning` идёт **первым** и становится required: facts (3–10), tensions (1–4), variants (2–3, у `bet_axis` enum из трёх осей), `choice_question`. Состав полей — по спецификации.
- `SYSTEM_PROMPT`: роль «OKR Intake Analyst». Все текущие инструкции (horizon, mode, parsed_existing, missing_info, clarifying_questions, assumptions, warnings) остаются, к ним добавляется `${REASONING_RULES}`.
- Handler:
  - принимает необязательный `parent_kr_context` → блок `PARENT KEY RESULT:`, формулировка как в draft-okr;
  - после `callAITool` делает `res.clone().json()`; если ошибки нет — `extractDocNames`, затем `normalizeReasoning`, затем `ensureDistinctVariants` (redo = повторный `callAITool` с припиской про разные bet_axis);
  - в ответ добавляются `reasoning` (нормализованный), `reasoning_quality` и `reasoning_warning` (если есть); `_meta`, `__model_used` и HTTP-статус сохраняются;
  - при ошибке AI ответ уходит без изменений.

## Шаг 3: тесты handler'а (`index.test.ts`)
- [AI] ввод про активацию и отток 45%, block_12m: статус 200, фактов ≥3, вариантов 2–3, `reasoning_quality` есть, старые поля на месте.
- [AI] `extra_context` с `--- metrics.txt ---`: хотя бы у одного факта source = `doc:metrics.txt`.
- Без AI: `SYSTEM_PROMPT` содержит `REASONING_RULES` и `"clarifying_questions"` (`SYSTEM_PROMPT` экспортируется).
- Существующие 4 теста остаются зелёными.

## Проверка
- Прогнать `reasoning.test.ts` и `interpret-okr-input/index.test.ts` без RUN_AI; задеплоить функцию; один реальный вызов для smoke-проверки.
- Убедиться, что draft-okr, validate-okr и okr_rules.ts не изменились.
- Добавить запись в журнал решений.
