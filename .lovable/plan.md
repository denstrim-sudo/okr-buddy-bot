## Анализ Модуля 1 (текущая реализация)

### 1. Что сейчас участвует в Модуле 1

**UI-компонент**
- `src/components/aimbot/OkrGenerator.tsx` — единственный экран Модуля 1.
  - Локальный стейт: `objective` (string), `context` (string), `loading` (bool), `plan` (GeneratedPlan | null).
  - Один поток: ввод → кнопка «Сгенерировать OKR и решения» → `supabase.functions.invoke("generate-okr", { objective, context, extra_context, model })` → сразу получаем готовый `GeneratedPlan` (Objective + 2–4 KR + 2–3 Solutions на каждый KR).
  - Показ результата: список KR со Stat-плитками (baseline / target / metric).
  - Кнопка «Сохранить» через `useSavedOkrs`.

**Контексты и хуки**
- `src/contexts/DocsContext.tsx` — `buildContext(["okr_context","methodology"])` подмешивает методологию в промпт.
- `src/contexts/ModelContext.tsx` — выбор AI-модели.
- `src/hooks/useSavedOkrs.ts` — локальное сохранение OKR.

**Интеграция со страницей**
- `src/pages/Index.tsx`: `handleGenerated(plan, objective)` → одновременно:
  - кладёт `plan` и `objective` в стейт страницы,
  - строит `validatorDraft` (через `buildDraft`) и пробрасывает в `OkrValidator` (Модуль 2),
  - `SolutionsSection` и `SolutionStudio` (Модуль 3) читают `plan.key_results[*].solutions` и `krTexts`.

**Edge Functions**
- `supabase/functions/generate-okr/index.ts` — за один вызов делает Objective + 2–4 KR + 2–3 Solutions на каждый KR. Tool-call `generate_okr_plan`. Использует общий `_shared/ai.ts` (AIAI.BY, OpenAI-совместимый шлюз).

**Типы**
- `GeneratedPlan`, `GeneratedKR`, `GeneratedSolution` в `src/types/okr.ts`.

### 2. Проблемы текущей реализации (для нового сценария)

- Один шаг от свободного текста сразу к финальному плану — нет фазы интерпретации/уточнения.
- Solutions генерируются здесь же, что нарушает разделение «Модуль 1 — только OKR-черновик», и навязывает Модулю 3 источник данных.
- Нет различия `strategic_3y` vs `block_12m`.
- Нет режима `rewrite_existing` (вставленный пользователем OKR полностью перегенерируется без сохранения исходных формулировок).
- Нет явных `assumptions` / `warnings`, когда baseline/target/метрики неизвестны.
- Может вернуться до 4 KR — нужно жёсткое ограничение ≤ 3.
- Жёстко связан с Модулями 2 и 3 через общий `GeneratedPlan` — любое изменение типов ломает Solutions.

### 3. Минимальный безопасный план рефакторинга (только Модуль 1)

Принцип: **новые сущности добавляем рядом, старые типы/функции не трогаем**, чтобы Модули 2 и 3 продолжили работать как сейчас.

Шаги:

1. Ввести новый тип `OkrDraft` (отдельно от `GeneratedPlan`) — это «выход Модуля 1» в новой логике.
2. Создать **две новые Edge Functions** (`interpret-okr-input`, `draft-okr`) и оставить `generate-okr` как есть на время миграции — Модули 2/3 продолжают работать на нём.
3. Переписать только `OkrGenerator.tsx` под трёхфазный мастер (interpret → clarify → draft). Внешний контракт компонента — `onGenerated(plan, objective)` — сохраняем: при генерации финального draft строим адаптер `draftToGeneratedPlan(draft)` (Objective + KR без solutions: пустой массив) и вызываем существующий `onGenerated`. Это автоматически прокидывает результат в `OkrValidator` (Модуль 2), не трогая `Index.tsx`.
4. В `Index.tsx` — никаких правок. `SolutionStudio` и `SolutionsSection` продолжают читать `plan.key_results`. Если `solutions` пустой — Модуль 3 уже умеет это (`fallbackSolutions`, и `SolutionStudio` сам генерирует решения по `keyResults`).
5. Solutions из Модуля 1 убираем (они появятся естественно из Модуля 3). Старая ветка «сохранение OKR со старыми solutions» в `useSavedOkrs` остаётся — она просто получит draft без решений.

Что **не** делаем сейчас:
- Не удаляем `generate-okr` (deprecated, удалим позже отдельным PR).
- Не меняем `validate-okr` / `generate-solutions` / `validate-solution`.
- Не меняем типы `GeneratedPlan` / `GeneratedKR` / `GeneratedSolution`.
- Не трогаем `Index.tsx`, `OkrValidator`, `SolutionStudio`, `SolutionsSection`, `useSavedOkrs`.

### 4. Новая state-структура (только в `OkrGenerator.tsx`)

Новые типы — добавить в `src/types/okr.ts` рядом со старыми:

```ts
export type OkrHorizon = "strategic_3y" | "block_12m";
export type OkrMode = "from_scratch" | "rewrite_existing";

export interface OkrInputInterpretation {
  detected_horizon: OkrHorizon;
  detected_mode: OkrMode;
  topic_summary: string;
  has_existing_okr: boolean;
  parsed_existing?: { objective?: string; key_results?: string[] };
  missing_info: string[];        // baseline, target, метрики, сегмент и т.п.
  clarifying_questions: string[]; // 0..3 вопросов; если 0 — можно сразу draft
  assumptions: string[];          // что AI принял по умолчанию
  warnings: string[];
}

export interface OkrDraftKR {
  text: string;
  baseline?: string;     // optional — если неизвестно
  target?: string;
  metric?: string;
  kr_type: "leading" | "lagging";
  is_outcome: boolean;   // self-check от модели
  assumptions: string[]; // на чём основана формулировка
  warnings: string[];    // напр. "нет baseline", "похоже на activity"
}

export interface OkrDraft {
  horizon: OkrHorizon;
  mode: OkrMode;
  objective: string;
  key_results: OkrDraftKR[]; // ровно 1..3
  global_assumptions: string[];
  global_warnings: string[];
  score_hint: number; // 0-100, грубая самооценка перед аудитом
}
```

Локальный state `OkrGenerator`:

```ts
type Phase = "input" | "interpreting" | "clarify" | "drafting" | "draft_ready";

const [phase, setPhase] = useState<Phase>("input");
const [horizon, setHorizon] = useState<OkrHorizon>("block_12m"); // переключатель в UI
const [rawInput, setRawInput] = useState("");        // свободный текст / вставленный OKR
const [contextText, setContextText] = useState("");
const [interpretation, setInterpretation] = useState<OkrInputInterpretation | null>(null);
const [answers, setAnswers] = useState<Record<number, string>>({}); // ответы на clarifying_questions
const [draft, setDraft] = useState<OkrDraft | null>(null);
```

Поток фаз:
- `input` → пользователь пишет/вставляет, выбирает `horizon`, нажимает «Интерпретировать».
- `interpreting` → вызов `interpret-okr-input` → `interpretation`.
- Если `clarifying_questions.length > 0` → `clarify` (показываем вопросы, собираем `answers`, кнопка «Пропустить» допустима).
- Иначе — сразу `drafting`.
- `drafting` → вызов `draft-okr` с `interpretation + answers + horizon + mode` → `OkrDraft`.
- `draft_ready` → показ Objective + ≤3 KR с явными `warnings`/`assumptions`. Кнопки: «Передать в аудит» (вызов `onGenerated` через адаптер), «Уточнить ещё» (возврат в `clarify`), «Начать заново».

### 5. Новые Edge Functions

Используем существующий `_shared/ai.ts` и `callAITool` — никакой новой инфраструктуры.

**A. `supabase/functions/interpret-okr-input/index.ts`**
- Вход: `{ raw_input: string, horizon: OkrHorizon, extra_context?: string, model?: string }`.
- Выход (tool `interpret_okr_input`, схема = `OkrInputInterpretation`).
- Системный промпт:
  - канон уровней Strategy → strategic_3y → block_12m → Decisions/Solutions;
  - различение `from_scratch` vs `rewrite_existing` (детектор: похоже ли на готовый OKR);
  - правило: возвращать ≤3 уточняющих вопроса, и только если они реально нужны;
  - все тексты — на русском; enum'ы — на английском.

**B. `supabase/functions/draft-okr/index.ts`**
- Вход: `{ raw_input, horizon, mode, interpretation, clarifying_answers: string[], extra_context?, model? }`.
- Выход (tool `draft_okr`, схема = `OkrDraft`).
- Системный промпт:
  - ровно 1 Objective, 1..3 KR, KR ориентированы на outcome;
  - если baseline/target/metric неизвестны — оставлять пустыми и заполнять `assumptions` / `warnings`, не выдумывать цифры;
  - `mode = rewrite_existing` → сохранять смысл и узнаваемые формулировки исходного OKR, переписывать минимально;
  - различать `strategic_3y` (3 года, амбициозный, без квартального уклона) и `block_12m` (12 мес, достижимый в годовом цикле);
  - запрет на «conduct/support/build/launch» как корневой глагол KR;
  - solutions НЕ генерировать.

**C. `generate-okr` — оставляем без изменений** на этой итерации (deprecated, на удаление позже).

### 6. Адаптер для совместимости с Модулями 2 и 3

В `OkrGenerator.tsx` добавить чистую функцию (не трогая типы):

```ts
const draftToGeneratedPlan = (d: OkrDraft): GeneratedPlan => ({
  objective_refined: d.objective,
  score: d.score_hint,
  key_results: d.key_results.map((k) => ({
    text: k.text,
    baseline: k.baseline ?? "",
    target: k.target ?? "",
    metric: k.metric ?? "",
    kr_type: k.kr_type,
    solutions: [], // Модуль 3 сам сгенерирует
  })),
});
```

При нажатии «Передать в аудит» вызываем существующий `onGenerated(draftToGeneratedPlan(draft), draft.objective)`. Никаких правок в `Index.tsx`, `OkrValidator`, `SolutionStudio` не требуется.

### 7. Риски и как их закрываем

| Риск | Влияние | Митигация |
|---|---|---|
| Модули 2/3 ожидают непустой `solutions` | Поломка Studio/SolutionsSection | Уже есть `fallbackSolutions` и собственная генерация в `SolutionStudio` по `keyResults` — пустой `solutions[]` безопасен. Проверить визуально после первой итерации. |
| Сохранённые ранее OKR (через `useSavedOkrs`) имеют старую структуру с solutions | UI saved list | Структура `GeneratedPlan` не меняется → совместимо. Новые сохранения будут с пустым `solutions`. |
| Два вызова AI вместо одного → выше латентность и стоимость | UX | Фаза `clarify` пропускается, если `clarifying_questions = []`. Показываем явный progress по фазам. |
| Модель проигнорирует ограничение «≤3 KR» | Нарушение методологии | Жёстко в JSON-схеме: `maxItems: 3, minItems: 1`. Доп. проверка на стороне Edge Function — обрезать до 3. |
| `rewrite_existing` будет переписывать слишком агрессивно | Потеря исходных формулировок | В системном промпте — явное правило «минимальные правки», и `parsed_existing` передаётся в `draft-okr` как baseline. |
| Регрессия в Модуле 2 из-за изменения формы данных | Поломка аудита | Адаптер сохраняет точно ту же форму `GeneratedPlan`, что и раньше. `validate-okr` не трогаем. |
| Расхождение `horizon` между Модулем 1 и аудитом | Аудит не учитывает 3y vs 12m | На этой итерации — не блокирует (Модуль 2 работает по общим правилам Doerr). В следующей итерации можно прокинуть `horizon` в `validate-okr`. |

### 8. Что нужно от тебя перед реализацией

- Подтверди план (или скажи, что менять).
- Подтверди, что `generate-okr` оставляем как deprecated до отдельного PR (а не удаляем сейчас).
- Подтверди дефолт `horizon` в UI: предлагаю `block_12m`.

После твоего ОК — реализую строго по этому плану одной итерацией: 2 новые Edge Functions + переписанный `OkrGenerator.tsx` + новые типы. Никаких других файлов не трогаю.