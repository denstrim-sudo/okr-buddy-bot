# План: устранение конфликта O2↔O3 + guard цифр в rewritten_objective (TDD)

## Проблема
Правило O2 требовало «ограниченности по времени» Objective → модель вписывала дату/число → автоматически проваливала O3 (без цифр в Objective) → потолок score≤60. Горизонт уже передаётся отдельным полем `horizon`, поэтому требование цифр в тексте O2 избыточно.

## Шаги (строго TDD: RED → GREEN → REFACTOR)

### ШАГ 1 (RED) — `supabase/functions/_shared/okr_rules.test.ts`
Создать/дополнить тесты:
1. `BASE_RULES` НЕ содержит связки «ограничен … времени», но содержит фразу `"соответствует выбранному горизонту"`.
2. `BASE_RULES` явно говорит, что цифра/дата в Objective не требуется (ассерт на ключевую фразу из новой редакции).
3. И `OKR_RULES_BLOCK`, и `OKR_RULES_BLOCK_QUARTER` содержат обновлённую формулировку O2 (регрессия — квартальный блок не унаследовал старый текст).

### ШАГ 2 (GREEN) — `supabase/functions/_shared/okr_rules.ts`
Заменить строку O2 на:
```
- O2 [important]  Objective амбициозный, запоминающийся, по масштабу и смыслу соответствует выбранному горизонту (НЕ требует явного срока/даты/номера периода в тексте — горизонт уже зафиксирован отдельным полем "horizon").
```
Тесты ШАГа 1 → зелёные.

### ШАГ 3 (RED) — `supabase/functions/validate-okr/index.test.ts`
Юнит-тест на `containsDigits` из нового `supabase/functions/_shared/textGuards.ts`:
- `containsDigits("Удвоить выручку к 2026 году") === true`
- `containsDigits("Стать предсказуемой опорой роста для команды") === false`

### ШАГ 4 (GREEN) — `supabase/functions/_shared/textGuards.ts`
```ts
export function containsDigits(text: string): boolean {
  return /\d/.test(text);
}
```

### ШАГ 5 (RED) — интеграционные тесты validate-okr
Вынести логику в чистую функцию `sanitizeRewrittenObjective(callAITool, args, firstResult)` (тестируемую без сети, с моком `callAITool`):
1. Если `rewritten_objective` содержит цифру → выполняется ровно один повторный вызов с явной инструкцией убрать цифры.
2. Если после повтора цифра осталась → возвращается ответ с `rewritten_objective_warning: true`, без дальнейших ретраев.
3. Если изначально цифр нет → `callAITool` вызывается ровно 1 раз (без лишнего вызова).

В `src/types/okr.ts` добавить опциональное:
```ts
rewritten_objective_warning?: boolean;
```

### ШАГ 6 (GREEN) — `supabase/functions/validate-okr/index.ts`
После получения результата:
- Парсим `data.rewritten_objective`.
- Если `containsDigits` → один повторный `callAITool` с дополнением к user prompt: «Твой предыдущий rewritten_objective содержал цифры, что нарушает правило O3. Перепиши rewritten_objective и rewritten_key_results без единой цифры в Objective, сохранив смысл. Цифры в Key Results (target/baseline) — оставь как есть, они разрешены.»
- Если после повтора всё ещё цифра — `rewritten_objective_warning = true`, отдать как есть (без бесконечных ретраев).

### ШАГ 7 (REFACTOR + UI)
- `src/components/aimbot/OkrValidator.tsx`: рядом с блоком «Переписанная формулировка» при `report.rewritten_objective_warning === true` показать пометку:
  `⚠ Переписанная версия всё ещё может содержать цифру — проверьте вручную.`
- `src/components/aimbot/__tests__/OkrValidator.test.tsx`: тест на рендер этой пометки.

## Технические детали

**Файлы, которые меняются:**
- `supabase/functions/_shared/okr_rules.ts` — текст O2.
- `supabase/functions/_shared/okr_rules.test.ts` — новый/дополненный.
- `supabase/functions/_shared/textGuards.ts` — новый.
- `supabase/functions/validate-okr/index.ts` — guard-логика после `callAITool`, экспорт `sanitizeRewrittenObjective` для тестируемости.
- `supabase/functions/validate-okr/index.test.ts` — тесты guard'а с моком.
- `src/types/okr.ts` — опциональное поле `rewritten_objective_warning?: boolean`.
- `src/components/aimbot/OkrValidator.tsx` — UI-пометка.
- `src/components/aimbot/__tests__/OkrValidator.test.tsx` — тест на пометку.

**Контракты:**
- `containsDigits(text: string): boolean` — `/\d/.test(text)`.
- `sanitizeRewrittenObjective(...)` — максимум 1 корректирующий ретрай, помечает `rewritten_objective_warning` если не удалось, никаких циклов.
- Поле `rewritten_objective_warning` опциональное — обратная совместимость сохраняется.

## Acceptance
- [x] Новая редакция O2 покрыта снапшот-тестом, конфликт с O3 исчез.
- [x] При цифрах в `rewritten_objective` — ровно 1 корректирующий повтор.
- [x] При неуспехе — UI показывает предупреждение.
- [x] При чистом ответе — никаких лишних AI-вызовов.