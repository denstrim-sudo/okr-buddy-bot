# Типология KR из AI-Native SAFe (три точки зрения)

Внедряем классификацию каждого Key Result по одной из трёх осей и мягкое правило аудита о балансе набора. Работаем в TDD (RED → GREEN → REFACTOR).

## Три оси

- **Клиент и бизнес** (`customer_business`) — польза клиенту и бизнесу: опережающие сигналы реакции клиентов + запаздывающие показатели прибыли, удержания, влияния.
- **Осуществимость и риски** (`feasibility_risk`) — две функции: (а) осуществимость — «подтвердить/доказать, что возможно»; (б) защита критичного — «удерживать X ниже/выше границы, пока растёт основное». Обе — опережающие. Для нового/рискованного Objective полезны обе сразу; для оптимизации известного — достаточно защитной.
- **Обучение и развитие** (`learning`) — чему научится организация: что показал прототип, что исключил эксперимент.

Квартальный горизонт — предпочтение опережающим KR. Типология — **подсказка**, а не требование: не все оси применимы к каждой цели.

## Часть A: классификация KR (аудит)

1. RED — `supabase/functions/validate-okr/index.test.ts`: тест, что `buildAuditorParameters(horizon)` содержит верхнеуровневое поле `kr_perspectives` (массив объектов `{ index:number, perspective: enum[customer_business|feasibility_risk|learning], rationale:string }`, без minItems/maxItems) и что оно в `required`.
2. GREEN — добавить это поле в `buildAuditorParameters` рядом с `rules`; в `buildSystemPrompt` — блок с определениями трёх осей и инструкцию классифицировать КАЖДЫЙ KR по одной наиболее подходящей оси, `rationale` — одно короткое предложение.
3. Тип `KrPerspective` в `src/types/okr.ts`, поле `kr_perspectives?: KrPerspective[]` в `ValidationReport` (optional — обратная совместимость).

## Часть B: правило KR-PERSPECTIVES (severity improve)

4. RED — `_shared/scoring.test.ts`: `knownRuleIdsFor` включает `KR-PERSPECTIVES` для всех горизонтов; `severityFor('KR-PERSPECTIVES', *) === 'improve'`; количество id 8 → 9 и 11 → 12.
5. GREEN — добавить id в `SEVERITY_BY_RULE_ID` (improve) и в `knownRuleIdsFor` (base-список, значит и для quarter).
6. RED — `_shared/okr_rules.test.ts`: `BASE_RULES` содержит правило `KR-PERSPECTIVES` с тремя осями; текст маркирован как подсказка («подсказка», «не все оси применимы»); описание `feasibility_risk` включает обе функции (осуществимость и «не сломать»); квартальный блок упоминает предпочтение опережающих.
7. GREEN — добавить формулировку правила в `BASE_RULES` (провал только если ВСЕ KR одной оси И расширение очевидно уместно; hint называет недостающую ось и даёт пример KR под данный Objective; запрет механического дописывания). В `OKR_RULES_BLOCK_QUARTER` — фразу о предпочтении опережающих.

## Часть C: UI

8. RED — `src/components/aimbot/__tests__/OkrValidator.test.tsx`: бейдж оси рядом с каждым KR при наличии `report.kr_perspectives`; бейджи отсутствуют, если поля нет.
9. GREEN — компактные чипы с подписями «Клиент/бизнес», «Осуществимость», «Обучение» рядом с номером KR; `rationale` — в tooltip (мобильный экран не засоряем). Цвета через семантические токены.

## REFACTOR и проверки

- Обновить ВСЕ зависимые тесты на длину набора правил и enum id: `validate-okr/index.test.ts` (числа 8 и 11, включая AI-тесты сверки набора id) и `draft-okr` (он тоже строит псевдо-rules из `knownRuleIdsFor`) — найти все вхождения перед правкой.
- Проверить, что `applyScoreRecompute` корректно учитывает новое improve-правило (вес 1 — score не должен заметно смещаться).
- Прогнать Deno-тесты edge-функций и Vitest.
- Задеплоить `validate-okr`.

## Файлы

```text
supabase/functions/validate-okr/index.ts
supabase/functions/validate-okr/index.test.ts
supabase/functions/_shared/scoring.ts
supabase/functions/_shared/scoring.test.ts
supabase/functions/_shared/okr_rules.ts
supabase/functions/_shared/okr_rules.test.ts
supabase/functions/draft-okr/index.test.ts (числа набора правил)
src/types/okr.ts
src/components/aimbot/OkrValidator.tsx
src/components/aimbot/__tests__/OkrValidator.test.tsx
```

## Журнал решений: AI-Native SAFe

- **Уровень 1 — типология KR (три точки зрения)**: внедряем сейчас, как мягкое improve-правило + классификация в аудите.
- **Уровень 2 — парные показатели, Moonshot/Roofshot**: отложено, решаем по итогам наблюдения за качеством уровня 1.
- **Уровень 3 — дерево бизнес-эффектов (портфель → ART → PI → команда)**: отдельный модуль приложения, не часть этой задачи.
