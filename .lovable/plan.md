# Два шага: Шаг 0 (аудит по OKR-PI) → Модуль 1.1 («куда бьём»)

Порядок важен: сначала Шаг 0, потому что его записи и ракурсы К/О/У используются в Модуле 1.1. Каждый шаг идёт по TDD (RED → GREEN → REFACTOR), без RUN_AI всё зелёное. Изменённые тесты перечисляются в итоговом сообщении.

## Шаг 0. Свод правил аудита приводим к OKR-PI
Не трогаем: interpret-okr-input. Механизм аудита (один вызов, схема, isGrounded, пересчёт score) не меняется. Все новые параметры необязательные.

**Новые входы** (validate-okr в обоих режимах, draft-okr): `okr_type` committed/aspirational/mixed/не задан; `okr_status` direction/regular (по умолчанию regular).

**RED: okr_rules.test.ts, scoring.test.ts**
- `knownRuleIdsFor(ctx)`: OKR-TYPE-DECLARED, OBJ-NO-NUMBERS, OBJ-QUALITATIVE, KR-COUNT, KR-MEASURABLE, KR-OUTCOME, KR-REQUIRED-ANGLES, KR-QUALITY-PAIR, KR-LEARNING-FORM, KR-LEADING, KR-TIMEBOUND; плюс OBJ-AMBITIOUS для aspirational/mixed и Q-REACH для квартала. Старая сигнатура `(horizon)` продолжает работать.
- `severityFor(id, ctx)`, `requiredAngles`, `krCountRange`, `ruleApplicability` — как в брифе, пункты 3–6.
- `getRulesBlock(ctx)`: формы удержания порога и форма обучения, запрещённые глаголы, формальный [У], пара количество/качество, ракурсы, Objective без способа; без KR-BASELINE-TARGET, Q-THEME, Q-FOCUS.
- Старые тесты (KR-BASELINE-TARGET, Q-FOCUS, Q-THEME, KR-PERSPECTIVES как improve) переписываются со ссылкой на раздел OKR-PI. Молча не удаляются.

**RED: validate-okr/index.test.ts** (без AI): в enum схемы нет OKR-TYPE-DECLARED; сервер добавляет его сам, с hint из брифа; неприменимые правила приходят с `applicable=false, pass=true`, на score не влияют. Эталоны 12–15 запускаются только с RUN_AI.

**GREEN**
- okr_rules.ts и scoring.ts: новый свод правил, эталоны банка по типу OKR (кредит в один клик / надёжность в пиковые дни / антифрод) и один отрицательный пример. `recomputeScore` пропускает неприменимые правила.
- validate-okr: принимает новый контекст, в промпте строки «ТИП OKR» и «СТАТУС», ракурсы К/О/У вместо старой типологии. `kr_perspectives` переименовывается в К/О/У. Документы подаются как «КОНТЕКСТ ОРГАНИЗАЦИИ (не правила)». Редактору добавляется указание про глаголы исполнения и формы удержания порога.
- draft-okr: передаёт контекст в правила; без него работает как раньше.
- Экран: селекторы «Тип» и «Статус» в аудите OKR. Неприменимые правила выводятся серым. Тип и статус сохраняются вместе с OKR, старые записи и импорт продолжают работать (тест). Подписи осей ракурсов — на русском.

## Модуль 1.1. Варианты = ограничения («куда бьём»)
Меняются только interpret-okr-input, вызов функции в генераторе и журнал. draft-okr, validate-okr и okr_rules.ts не трогаем. Прежние поля ответа сохраняются. Слово «драйвер» в промпте не используется.

**RED: reasoning.test.ts** (без AI): `normalizeText`; `distinct_constraints` вместо `distinct_axes`; `isSolutionInDisguise` по списку маркеров (вариант помечается, но не отбрасывается); `extractNumbers`; проверка цифр по haystack (`source_unverified`, `effect_unverified`); `angles_incomplete_ids`, `no_narrowing_ids`, `missing_next_constraint_ids`; лишние suggested отбрасываются, `too_many_suggested`; `ensureDistinctVariants` теперь проверяет различие ограничений; фикстура 6.2. Тесты на bet_axis переписываются.

**GREEN**
- Новая схема: `lever_tree`, `boundary_conditions`, `reframed_solutions`, `discriminating_data`. Новая структура варианта: origin, strike_at, where_it_holds, evidence, if_removed, hypothesis, refutation, narrowing, kr_directions с ракурсом К/О/У. bet_axis удаляется.
- Блок REASONING_RULES переписывается по брифу. `leverLabel(horizon)` возвращается в ответе как `reasoning.lever_label`.
- Handler принимает `known_constraints`, добавляет в промпт блок «ОГРАНИЧЕНИЯ, НАЗВАННЫЕ ГРУППОЙ», при повторе использует новый текст.
- OkrGenerator: в вызов интерпретации передаётся `parent_kr_context` (тест Vitest: с родительским KR и без него). Больше в компоненте ничего не меняется.

**Тесты handler'а**: промпт содержит «куда бьём», boundary_conditions, reframed_solutions, next_constraint и не содержит «bet_axis» и «драйвер»; known_constraints попадает в промпт (через мок). С AI: фикстура 6.2 и вариант с known_constraints.

## Завершение
- Прогнать все тесты Deno и Vitest без AI. Задеплоить validate-okr, draft-okr и interpret-okr-input, сделать по одному реальному вызову.
- Создать `.lovable/decisions.md` с шестью записями из брифа. В `.lovable/plan/` положить описания шагов со списками изменённых тестов.
- Экран вариантов в этот план не входит.
