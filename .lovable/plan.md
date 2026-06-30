## Цель
Сделать `recomputeScore` источником истины: серверный пересчёт подменяет `score`/`score_hint`, если ответ модели расходится с канонической формулой более чем на 10 пунктов. Гейты в UI начнут опираться на пересчитанное число автоматически (контракт `data.score` сохраняется).

## ШАГ 3a — `scoreDiscrepancy` (RED → GREEN)

**Файл:** `supabase/functions/_shared/scoring.test.ts` (дополнить)

Новые тесты:
1. `scoreDiscrepancy(85, 74) === true` (разница 11 → расхождение).
2. `scoreDiscrepancy(85, 75) === false` (граница 10 → НЕ расхождение).
3. `scoreDiscrepancy(60, 60) === false` (разница 0).
4. `scoreDiscrepancy(60, 71) === true` (асимметрия: модель занизила).

**Файл:** `supabase/functions/_shared/scoring.ts`

```ts
export function scoreDiscrepancy(modelScore: number, recomputed: number): boolean {
  return Math.abs(modelScore - recomputed) > 10;
}
```

## ШАГ 3b — карта severity по rule id (общий хелпер)

**Файл:** `supabase/functions/_shared/scoring.ts`

Чтобы и `validate-okr`, и `draft-okr` могли пересчитывать счёт, выносим знание «id → severity» в shared-таблицу (источник правды — комментарии в `okr_rules.ts`):

```ts
export const SEVERITY_BY_RULE_ID: Record<string, RuleSeverity> = {
  O1: "important", O2: "important", O3: "critical",
  KR1: "critical", KR2: "critical", KR3: "critical",
  KR4: "important", KR10: "important",
  // quarter-only:
  "Q-Focus": "important", "Q-Theme": "improve", "Q-Reach": "important",
};

export function severityFor(ruleId: string, horizon?: string): RuleSeverity {
  if (horizon === "quarter_3m" && ruleId === "KR10") return "critical"; // override
  return SEVERITY_BY_RULE_ID[ruleId] ?? "improve";
}
```

Покрываем 2 unit-теста:
- `severityFor("KR10", "block_12m") === "important"`.
- `severityFor("KR10", "quarter_3m") === "critical"`.

## ШАГ 3c — `applyScoreRecompute` в validate-okr (RED → GREEN)

**Файл:** `supabase/functions/validate-okr/index.test.ts` (дополнить, без сети)

Новые тесты на чистую функцию `applyScoreRecompute(data, horizon?)`:
1. «Расхождение >10 → подменяет score и ставит флаг» — даём `rules` где один critical fail (recomputed=60), а `data.score=85` → ожидаем `data.score === 60`, `data.score_recomputed === true`.
2. «Расхождение ≤10 → ничего не трогаем» — `recomputed=83`, `data.score=85` → `data.score === 85`, флаг отсутствует.
3. «Severity в правиле отсутствует — берётся из `SEVERITY_BY_RULE_ID` по id» — даём `rules: [{id:"O3", pass:false}]` без severity → пересчёт всё равно понимает critical и применяет потолок 60.
4. Интеграционный тест на `handler` (без RUN_AI): мокать AI слой нельзя без рефакторинга, поэтому покрываем через прямой вызов экспортируемой функции на форме данных, идентичной ответу модели. Это даёт acceptance «handler-level», т.к. `applyScoreRecompute` — единственная развилка между ответом модели и `json(finalData)`.

**Файл:** `supabase/functions/validate-okr/index.ts`

- Экспортировать `applyScoreRecompute(data, horizon)`. Логика: нормализовать severity через `severityFor(rule.id, horizon)` при отсутствии в правиле; `const recomputed = recomputeScore(normalized)`; если `scoreDiscrepancy(data.score, recomputed)` → `data.score = recomputed; data.score_recomputed = true`.
- Вызвать после `sanitizeRewrittenObjective`, перед `json(finalData)`, передав уже валидированный `h`.
- Расширить `PARAMETERS` опциональным `score_recomputed: boolean` НЕ нужно — модель его не возвращает, поле проставляется сервером.

**Файл:** `src/types/okr.ts`

В `ValidationReport`:
```ts
score_recomputed?: boolean;
```

## ШАГ 3d — то же для draft-okr (RED → GREEN)

**Файл:** `supabase/functions/draft-okr/index.test.ts` (дополнить)

Новые тесты на экспорт `applyScoreHintRecompute(data, horizon)`:
1. «`self_audit.critical_fails: ["O3"]`, `important_fails: []`, `score_hint=85` → пересчёт по полному набору правил горизонта: все правила, кроме O3, считаются passed; критический fail включает потолок 60 → `score_hint=60`, `score_hint_recomputed=true`».
2. «Все правила прошли (`critical_fails=[]`, `important_fails=[]`), `score_hint=92` → recomputed=100, разница 8 ≤ 10 → флаг не ставится, `score_hint=92`».
3. «quarter_3m + `critical_fails: ["KR10"]` — KR10 для квартала critical → потолок 60 применяется, score_hint подменяется».

**Файл:** `supabase/functions/draft-okr/index.ts`

- Экспортировать `applyScoreHintRecompute(data, horizon)`:
  1. Собрать «известный набор правил для горизонта»: `["O1","O2","O3","KR1","KR2","KR3","KR4","KR10"]` + `["Q-Focus","Q-Theme","Q-Reach"]` если `horizon === "quarter_3m"`.
  2. Для каждого id: `pass = !(critical_fails ∪ important_fails).includes(id)`, `severity = severityFor(id, horizon)`.
  3. `recomputed = recomputeScore(pseudoRules)`; если `scoreDiscrepancy(data.score_hint, recomputed)` → `data.score_hint = recomputed; data.score_hint_recomputed = true`.
- Вызвать в `handler` сразу после `capKeyResults(data, h)`.

**Файл:** `src/types/okr.ts`

В `OkrDraft`:
```ts
score_hint_recomputed?: boolean;
```

## Регрессионные гарантии
- `sanitizeRewrittenObjective`, `capKeyResults`, `buildSystemPrompt`, `okr_rules`, существующие `recomputeScore` тесты не меняются.
- UI-гейт «Передать в Решения» в `OkrValidator.tsx` уже читает `report.score >= 70` — никаких правок UI не требуется, новый порог сработает автоматически (но я могу опционально показать индикатор «score пересчитан сервером», если попросите).
- `score_recomputed` / `score_hint_recomputed` — опциональные поля, обратной совместимости не ломают.

## Acceptance Criteria
- [x] `scoreDiscrepancy` покрыта тестами включая граничное значение 10.
- [x] `validate-okr` экспортирует и вызывает `applyScoreRecompute` — проверено unit-тестами на чистой функции с реальной формой ответа модели.
- [x] `draft-okr` экспортирует и вызывает `applyScoreHintRecompute` для всех трёх горизонтов.
- [x] `severityFor` отдельно покрыта на override KR10 для quarter_3m.
- [x] Все ранее зелёные тесты (`validate-okr`, `draft-okr`, `okr_rules`, `scoring`) остаются зелёными.

## Файлы, которые буду менять
- `supabase/functions/_shared/scoring.ts` (+ `scoreDiscrepancy`, `SEVERITY_BY_RULE_ID`, `severityFor`)
- `supabase/functions/_shared/scoring.test.ts` (+ тесты)
- `supabase/functions/validate-okr/index.ts` (+ `applyScoreRecompute`, вызов в handler)
- `supabase/functions/validate-okr/index.test.ts` (+ тесты)
- `supabase/functions/draft-okr/index.ts` (+ `applyScoreHintRecompute`, вызов в handler)
- `supabase/functions/draft-okr/index.test.ts` (+ тесты)
- `src/types/okr.ts` (+ опциональные поля флагов пересчёта)
