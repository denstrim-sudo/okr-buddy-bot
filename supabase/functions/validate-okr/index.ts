import { handleCors, callAITool, errorJson, json } from "../_shared/ai.ts";
import { getAuditorRulesBlock, getFewShotBlock, ANGLES_DEFINITION, KR_FORM_DEFINITION, okrTypeLabel, okrStatusLabel } from "../_shared/okr_rules.ts";
import { buildExtraBlock } from "../_shared/ai.ts";
import { containsDigits, isGrounded } from "../_shared/textGuards.ts";
import {
  recomputeScore, severityFor, modelRuleIdsFor, evidenceKindOf, addServerRules, applyRuleContext, toCtx,
  normalizeOkrType, normalizeOkrStatus, type ScoringRule, type RuleCtx,
} from "../_shared/scoring.ts";

export const DOCS_HEADER = "КОНТЕКСТ ОРГАНИЗАЦИИ (факты и термины, НЕ правила; при расхождении приоритет у канонических правил выше):";

function withHorizon(horizon: string, ctx?: RuleCtx): RuleCtx {
  return { ...(ctx ?? {}), horizon };
}

export const buildSystemPrompt = (horizon: string, ctxIn?: RuleCtx) => {
  const ctx = toCtx(withHorizon(horizon, ctxIn));
  return `You are an expert OKR Coach auditing an OKR using the bank OKR-PI methodology.

HORIZON OF THIS OKR: ${horizon}${horizon === "quarter_3m" ? " — применяй КВАРТАЛЬНЫЙ набор правил (KR-LEADING→critical и доп. правило Q-REACH)." : ""}
ТИП OKR: ${okrTypeLabel(ctx.okr_type)}
СТАТУС: ${okrStatusLabel(ctx.okr_status)}

Given an Objective and a list of Key Results, evaluate them against these RULES (canonical, identical to those used by the drafter):

${getAuditorRulesBlock(ctx)}

ЭТАЛОНЫ (сравнивай формулировки с этими образцами, а не с абстрактным определением):

${getFewShotBlock(ctx)}

For EACH rule you MUST return:
- "reasoning": СНАЧАЛА рассуждение (2-4 предложения на русском): к какому типу относится KR (outcome/activity, leading/lagging), сверка с ЭТАЛОНОМ выше (какой образец ближе — плохой или отличный и почему), и ТОЛЬКО потом вывод. Заполняется ДО pass. Не выноси вердикт до рассуждения.
- "severity": уровень важности замечания
  - "critical" — без исправления OKR методологически некорректен
  - "important" — снижает качество и управляемость, но OKR работоспособен
  - "improve" — точечное усиление: стилистика, уточнение сегмента, более конкретная метрика
  - Для pass=true ставь "improve" (или опускай).
- "why": ОДНО короткое предложение на русском (≤140 символов), почему это важно. Для pass=true можно оставить пустым.
- "evidence": для pass=false — СКОПИРУЙ дословно фрагмент текста Objective или конкретного KR (≤80 символов), который стал причиной провала. Не перефразируй, не обобщай — буквальная подстрока. Для правил, которые нарушаются ФОРМУЛИРОВКОЙ: если не можешь найти такую дословную фразу в тексте — значит, основания для fail нет, ставь pass=true вместо этого. Для pass=true — пустая строка.

ПОРЯДОК ЗАПОЛНЕНИЯ ДЛЯ КАЖДОГО ПРАВИЛА: reasoning → severity → pass → hint/why/evidence. Не переставляй.

ТЫ — АУДИТОР. Твоя работа — только вердикты по правилам. НЕ переписывай OKR: переписыванием занимается отдельный проход (РЕДАКТОР).

${ANGLES_DEFINITION}

Для КАЖДОГО KR без пропусков заполни kr_perspectives: ракурс, форму и опережающий/запаздывающий (index — 0-based позиция KR, rationale — одно короткое предложение). Это разметка ОДНОГО KR, а не оценка набора.
${KR_FORM_DEFINITION}
Ракурс определяй по тому, ЧТО измеряет KR, а НЕ по его форме:
- [К] — польза для клиента или банка, ради которой существует цель: скорость, доступность, конверсия, доход, качество сервиса. Может быть записан и как рост («с X до Y»), и как порог («остаётся не ниже X»).
- [О] — то, что НЕ должно ухудшиться, пока двигаем основное: риск, потери, побочный эффект, ограничитель. Тоже может быть и ростом, и порогом.
- [У] — что станет известно к дате.
Проверка: если KR убрать, исчезнет ли сама польза для клиента (тогда [К]) или только защита от побочного эффекта (тогда [О])?
Пример: «Доступность входа и оплат в пиковые дни остаётся не ниже 99,9%» — это [К]: доступность и есть польза для клиента. «Частота релизов остаётся не ниже текущей» — это [О]: защищает от надёжности через заморозку релизов.
Правила OBJ-NO-NUMBERS, KR-OUTCOME, KR-MEASURABLE, KR-TIMEBOUND, KR-LEADING, KR-COUNT, KR-REQUIRED-ANGLES НЕ оценивай — их вычисляет сервер по твоей разметке. OKR-TYPE-DECLARED тоже проверяет сервер.

Return STRICT JSON only via the provided tool.

IMPORTANT: All text fields (label, hint, why, reasoning, summary, suggestion) MUST be in RUSSIAN. Rule ids and enum values stay English.`;
};

/**
 * Схема РЕДАКТОРА. Второй проход: на входе — OKR + результаты аудита,
 * на выходе ТОЛЬКО переписанные формулировки + пояснение коуча.
 */
export function buildEditorParameters() {
  return {
    type: "object",
    properties: {
      rewritten_objective: { type: "string", description: "Переписанный Objective без цифр (цифры в Objective нарушают правило OBJ-NO-NUMBERS)." },
      rewritten_key_results: {
        type: "array",
        items: { type: "string" },
        description: "Переписанные Key Results в том же порядке и количестве, как в исходном OKR. Если конкретный KR не требует изменений — верни его исходную формулировку.",
      },
      editor_note: {
        type: "string",
        description: "Кратко (1-2 предложения): что изменено, что сохранено от оригинала, откуда взять данные для плейсхолдеров X/Y. Русский.",
      },
    },
    required: ["rewritten_objective", "rewritten_key_results"],
    additionalProperties: false,
  };
}

/**
 * Промпт РЕДАКТОРА-КОУЧА: минимальное вмешательство с сохранением смыслового
 * ядра. Видит ВЕСЬ набор KR разом (без дублирования смысла между ними),
 * использует явные плейсхолдеры X/Y вместо выдуманных чисел.
 */
export function buildEditorPrompt(
  objective: string,
  keyResults: string[],
  failedRules: Array<{ id: string; label?: string; hint?: string; why?: string; reasoning?: string }>,
  horizon: string,
  ctxIn?: RuleCtx,
): string {
  const ctx = toCtx(withHorizon(horizon, ctxIn));
  const failedBlock = failedRules.length
    ? failedRules
        .map((r, i) => {
          const label = r.label ? ` (${r.label})` : "";
          const hint = r.hint ? `  hint: ${r.hint}` : "";
          const why = r.why ? `  why: ${r.why}` : "";
          return `${i + 1}. ${r.id}${label}${hint ? "\n" + hint : ""}${why ? "\n" + why : ""}`;
        })
        .join("\n")
    : "(нет провалов — верни исходные формулировки в rewritten_*)";
  const krList = keyResults.map((t, i) => `KR${i + 1}: ${t}`).join("\n");
  return `Ты — OKR-КОУЧ, а не переписыватель. Твоя задача — минимально исправить формулировки, чтобы закрыть ВСЕ проваленные правила разом, СОХРАНИВ смысл и авторское намерение, не создавая новых нарушений.

ПРИНЦИПЫ:
1. МИНИМАЛЬНОСТЬ: меняй только то, что нарушает правило (глагол, добавь метрику/baseline). Остальную часть формулировки сохраняй как можно ближе к оригиналу.
2. СОХРАНИ СМЫСЛОВОЕ ЯДРО: сохраняй ключевые сущности исходного KR — метрику, объект измерения, предметную область. Не подменяй тему.
3. ЧЕСТНОСТЬ С ДАННЫМИ: НЕ выдумывай и НЕ подставляй правдоподобные baseline/target. Если исходное число неизвестно — ВСЕГДА используй явный плейсхолдер («с X% до Y%», «с X до Y») и в editor_note укажи, откуда взять эти данные (какой отчёт/метрика/замер). Правдоподобная выдуманная цифра ЗАПРЕЩЕНА — она создаёт ложную точность.
4. ОБЗОР НАБОРА: тебе дан ВЕСЬ набор KR. Не дублируй смысл между KR; если правка пересекается с соседним KR — выбери иную формулировку, не создающую дубль.
5. ОПОРА НА ЭТАЛОНЫ: сверяйся с образцами ниже, но не копируй их дословно — адаптируй под смысл конкретного KR.

ГОРИЗОНТ: ${horizon}
ТИП OKR: ${okrTypeLabel(ctx.okr_type)}. СТАТУС: ${okrStatusLabel(ctx.okr_status)}.
Для обязательных OKR глаголы исполнения допустимы. Не заменяй форму удержания порога на «с X до Y».

ЭТАЛОНЫ (используй как образец качества переписывания):

${getFewShotBlock(ctx)}

ИСХОДНЫЙ OBJECTIVE: ${objective}

ИСХОДНЫЕ KEY RESULTS (полный набор, для обзора и защиты от дублей):
${krList}

ПРОВАЛЕННЫЕ ПРАВИЛА (закрой ВСЕ проваленные правила разом, минимальным вмешательством, не создавая новых):
${failedBlock}

ЖЁСТКИЕ ОГРАНИЧЕНИЯ:
- rewritten_objective НЕ должен содержать цифр (это нарушит OBJ-NO-NUMBERS).
- rewritten_key_results ДОЛЖНЫ идти в том же порядке и количестве, что и исходные KR.
- Если конкретный KR уже хорош — верни его исходную формулировку без изменений.
- Не смешивай имя правила (OBJ-*, KR-*) с номером KR: имена правил — это ярлыки аудита, а не позиции KR.
- Все rewritten_* и editor_note — на русском.

editor_note: 1-2 предложения о том, что изменено, что сохранено от оригинала, и откуда пользователю взять реальные значения для плейсхолдеров X/Y.

Return STRICT JSON only via the provided tool.`;
}


/**
 * Схема АУДИТОРА. Только вердикты по правилам, БЕЗ rewritten_*. Переписыванием
 * занимается отдельный проход РЕДАКТОРА (mode=fix).
 *
 * opts.lite — облегчённая схема без обязательного `reasoning` в каждом правиле.
 * Используется для не-OpenAI моделей: генерация reasoning на каждое правило
 * занимает у них в разы больше времени и упирается в дедлайн запроса.
 */
export function buildAuditorParameters(horizonOrCtx?: string | RuleCtx, opts: { lite?: boolean } = {}) {
  const ids = modelRuleIdsFor(horizonOrCtx);
  const lite = opts.lite === true;
  // deno-lint-ignore no-explicit-any
  const ruleProps: Record<string, any> = {
    id: { type: "string", enum: ids },
    label: { type: "string" },
    ...(lite
      ? {}
      : {
          reasoning: { type: "string", description: "Сначала рассуждение: к какому типу относится KR (outcome/activity, leading/lagging), сверка с эталоном, и ТОЛЬКО потом вывод. Заполняется ДО pass." },
        }),
    pass: { type: "boolean" },
    hint: { type: "string" },
    severity: { type: "string", enum: ["critical", "important", "improve"] },
    why: { type: "string" },
    evidence: { type: "string", description: "Для pass=false: ДОСЛОВНАЯ цитата (≤80 символов) из текста Objective или конкретного KR — фрагмент, который стал причиной fail. Для pass=true — пустая строка." },
  };
  const required = lite
    ? ["id", "label", "pass", "hint", "severity", "why", "evidence"]
    : ["id", "label", "reasoning", "pass", "hint", "severity", "why", "evidence"];

  return {
    type: "object",
    properties: {
      score: { type: "number", description: "0-100 overall validation score" },
      status: { type: "string", enum: ["pass", "warn", "fail"] },
      summary: { type: "string", description: "Short overall verdict in Russian." },
      rules: {
        type: "array",
        minItems: ids.length,
        maxItems: ids.length,
        items: {
          type: "object",
          // ВАЖНО: порядок properties влияет на порядок генерации у tool-calling
          // моделей. reasoning ДОЛЖНО идти раньше pass — сначала рассуждение,
          // потом вердикт (chain-of-thought до вердикта).
          properties: ruleProps,
          required,
          additionalProperties: false,
        },
      },
      kr_perspectives: {
        type: "array",
        description: "Ракурс КАЖДОГО Key Result (OKR-PI 3.3): К — клиент и бизнес, О — осуществимость и риски, У — обучение. Порядок — как в исходном списке KR.",
        items: {
          type: "object",
          properties: {
            index: { type: "number", description: "0-based индекс Key Result в исходном списке." },
            perspective: { type: "string", enum: ["К", "О", "У"] },
            form: { type: "string", enum: ["range", "threshold", "learning", "execution", "binary", "unmeasurable"], description: "Форма ЭТОГО KR." },
            timing: { type: "string", enum: ["leading", "lagging"], description: "Опережающий или запаздывающий ЭТОТ KR." },
            rationale: { type: "string", description: "Одно короткое предложение на русском: почему такой ракурс, форма и timing." },
          },
          required: ["index", "perspective", "form", "timing", "rationale"],
          additionalProperties: false,
        },
      },
    },
    required: ["score", "status", "summary", "rules", "kr_perspectives"],
    additionalProperties: false,
  };
}

/**
 * Совместимость: старое имя buildParameters = buildAuditorParameters.
 * Используется в тестах и внешнем коде, где может встречаться прямой вызов.
 */
export const buildParameters = buildAuditorParameters;


/** Ре-экспорт для обратной совместимости: канонический источник — _shared/textGuards.ts. */
export { isGrounded };

const SANITIZE_HINT = "Твой предыдущий rewritten_objective содержал цифры, что нарушает правило OBJ-NO-NUMBERS. Перепиши rewritten_objective и rewritten_key_results без единой цифры в Objective, сохранив смысл. Цифры в Key Results (target/baseline) — оставь как есть, они разрешены.";

/**
 * Гарантирует, что rewritten_objective не содержит цифр.
 * - если изначально чист → возвращает initial как есть (БЕЗ повторного вызова).
 * - если содержит цифру → делает РОВНО один redo() и возвращает его результат.
 * - если после redo цифра всё ещё есть → возвращает второй результат с пометкой
 *   rewritten_objective_warning: true (без бесконечных ретраев).
 */
export async function sanitizeRewrittenObjective<T extends { rewritten_objective?: string; rewritten_objective_warning?: boolean }>(
  initial: T,
  redo: () => Promise<T>,
): Promise<T> {
  const firstObj = initial?.rewritten_objective ?? "";
  if (!containsDigits(firstObj)) return initial;
  let second: T;
  try {
    second = await redo();
  } catch (e) {
    console.error("sanitize redo failed", e);
    return { ...initial, rewritten_objective_warning: true };
  }
  const secondObj = second?.rewritten_objective ?? "";
  if (containsDigits(secondObj)) {
    return { ...second, rewritten_objective_warning: true };
  }
  return second;
}

/**
 * Серверный пересчёт score: оценка ВСЕГДА считается сервером по канонической
 * формуле. score_recomputed = true, если число модели отличалось.
 * Правила applicable=false и unconfirmed=true в score не учитываются.
 */
export function applyScoreRecompute<T extends { score?: number; rules?: any[]; score_recomputed?: boolean }>(
  data: T,
  horizon?: string,
): T {
  if (!data || !Array.isArray(data.rules) || data.rules.length === 0) return data;
  const normalized: ScoringRule[] = data.rules.map((r: any) => ({
    id: typeof r?.id === "string" ? r.id : undefined,
    pass: Boolean(r?.pass),
    applicable: r?.applicable === false ? false : undefined,
    unconfirmed: r?.unconfirmed === true ? true : undefined,
    unreliable: r?.unreliable === true ? true : undefined,
    severity: r?.severity === "critical" || r?.severity === "important" || r?.severity === "improve"
      ? r.severity
      : (typeof r?.id === "string" ? severityFor(r.id, horizon) : "improve"),
  }));
  const recomputed = recomputeScore(normalized);
  const modelScore = typeof data.score === "number" ? data.score : undefined;
  if (modelScore !== recomputed) data.score_recomputed = true;
  data.score = recomputed;
  return data;
}

/** Провал без цитаты (pass=false, grounded=false) — unconfirmed, в score не идёт. */
export function markUnconfirmed(rules: any[]): any[] {
  return rules.map((r: any) =>
    r && r.pass === false && r.grounded === false && r.applicable !== false && evidenceKindOf(String(r.id ?? "")) === "quote"
      ? { ...r, unconfirmed: true }
      : r
  );
}

/**
 * Эвристика: пустой/полностью проваленный rules[] — признак того, что
 * модель не справилась с форматом или вернула мусор. Используется для
 * повтора на той же модели.
 */
export function isAuditSuspicious(data: any): boolean {
  if (!data || !Array.isArray(data.rules) || data.rules.length === 0) return true;
  return data.rules.every((r: any) => r?.pass === false);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function runFixMode(req: Request, body: any): Promise<Response> {
  const { objective, key_results, failed_rules, horizon, extra_context, model, okr_type, okr_status } = body;
  if (!objective || typeof objective !== "string" || objective.trim().length < 3) {
    return errorJson("Objective is required (min 3 chars)", 400);
  }
  if (!Array.isArray(key_results) || key_results.length === 0) {
    return errorJson("At least one Key Result is required", 400);
  }
  const h: string = horizon === "strategic_3y" || horizon === "block_12m" || horizon === "quarter_3m" ? horizon : "block_12m";
  const krTexts = (key_results as string[]).map((t) => String(t));
  const failed = Array.isArray(failed_rules) ? failed_rules : [];

  const systemPrompt = buildEditorPrompt(String(objective), krTexts, failed, h, {
    okr_type: normalizeOkrType(okr_type), okr_status: normalizeOkrStatus(okr_status),
  });
  const extraBlock = buildExtraBlock(
    extra_context,
    DOCS_HEADER,
  );
  const userPrompt = `Перепиши OKR по правилам выше.${extraBlock}`;
  const modelArg = typeof model === "string" && model ? model : undefined;
  const params = buildEditorParameters();

  const first = await callAITool({
    systemPrompt,
    userPrompt,
    toolName: "rewrite_okr",
    toolDescription: "Переписать OKR так, чтобы закрыть проваленные правила.",
    parameters: params,
    model: modelArg,
  });
  if (first.status !== 200) return first;
  const firstData = await first.json();

  const finalData = await sanitizeRewrittenObjective(firstData, async () => {
    const retryPrompt = `${userPrompt}\n\nВАЖНО: ${SANITIZE_HINT}`;
    const r = await callAITool({
      systemPrompt,
      userPrompt: retryPrompt,
      toolName: "rewrite_okr",
      toolDescription: "Переписать OKR так, чтобы закрыть проваленные правила.",
      parameters: params,
      model: modelArg,
    });
    if (r.status !== 200) return firstData;
    return await r.json();
  });

  const modelUsed = typeof (finalData as any).__model_used === "string"
    ? (finalData as any).__model_used
    : undefined;
  delete (finalData as any).__model_used;
  if (modelUsed) (finalData as any).model_used = modelUsed;

  return json(finalData);
}

export const handler = async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json();
    const mode = body?.mode === "fix" ? "fix" : "audit";

    if (mode === "fix") {
      return await runFixMode(req, body);
    }

    // === mode = "audit" (дефолт) ===
    const { objective, key_results, key_results_full, horizon, extra_context, model, okr_type, okr_status } = body;
    if (!objective || typeof objective !== "string" || objective.trim().length < 3) {
      return errorJson("Objective is required (min 3 chars)", 400);
    }
    if (!Array.isArray(key_results) || key_results.length === 0) {
      return errorJson("At least one Key Result is required", 400);
    }
    const h: string = horizon === "strategic_3y" || horizon === "block_12m" || horizon === "quarter_3m" ? horizon : "block_12m";

    const ctx: RuleCtx = { horizon: h, okr_type: normalizeOkrType(okr_type), okr_status: normalizeOkrStatus(okr_status) };

    const enriched = Array.isArray(key_results_full) && key_results_full.length
      ? key_results_full
      : (key_results as string[]).map((t) => ({ text: String(t) }));

    const krList = enriched
      .map((k: any, i: number) => {
        const text = String(k?.text ?? "").trim();
        if (text.length < 4) return "";
        const meta: string[] = [];
        if (k?.baseline) meta.push(`baseline: ${String(k.baseline).trim()}`);
        if (k?.target) meta.push(`target: ${String(k.target).trim()}`);
        if (k?.metric) meta.push(`metric: ${String(k.metric).trim()}`);
        if (k?.kr_type) meta.push(`type: ${String(k.kr_type).trim()}`);
        return `KR${i + 1}: ${text}${meta.length ? `\n  (${meta.join(" · ")})` : ""}`;
      })
      .filter((s) => s.length > 0)
      .join("\n");

    const extraBlock = buildExtraBlock(
      extra_context,
      DOCS_HEADER,
    );
    const userPrompt = `OBJECTIVE: ${objective.trim()}\n\nKEY RESULTS (с метаданными baseline/target/metric/type, если есть):\n${krList}${extraBlock}\n\nAudit this OKR and return per-rule findings, overall score (0-100), summary. Переписывание OKR НЕ входит в твою задачу — этим займётся отдельный проход РЕДАКТОРА.`;

    const systemPrompt = buildSystemPrompt(h, ctx);
    const modelArg = typeof model === "string" && model ? model : undefined;

    // Полная схема (с reasoning на каждое правило) для ВСЕХ моделей — качество
    // аудита важнее скорости. Бюджет времени в _shared/ai.ts рассчитан на то,
    // что не-OpenAI модели генерируют её 30-60с.
    const params = buildAuditorParameters(ctx);

    const first = await callAITool({
      systemPrompt,
      userPrompt,
      toolName: "audit_okr",
      toolDescription: "Audit an OKR and return rule-by-rule findings (no rewrites).",
      parameters: params,
      model: modelArg,
      temperature: 0,
    });
    if (first.status !== 200) return first;
    let firstData = await first.json();

    // Подозрительный ответ (пустой/всё-fail) → один retry на ТОЙ ЖЕ модели.
    if (isAuditSuspicious(firstData)) {
      const retryPrompt = `${userPrompt}\n\nВАЖНО: твой предыдущий ответ оказался некорректным (пустой или полностью проваленный список правил). Перепроверь OKR честно: некоторые правила, скорее всего, выполнены. Верни полный набор rules с реалистичной оценкой pass/fail.`;
      const retry = await callAITool({
        systemPrompt,
        userPrompt: retryPrompt,
        toolName: "audit_okr",
        toolDescription: "Audit an OKR and return rule-by-rule findings (no rewrites).",
        parameters: params,
        model: modelArg,
        temperature: 0,
      });
      if (retry.status === 200) {
        const retryData = await retry.json();
        if (!isAuditSuspicious(retryData)) {
          firstData = retryData;
        } else {
          firstData.audit_unreliable = true;
        }
      } else {
        firstData.audit_unreliable = true;
      }
    }

    const finalData: any = firstData;

    // В режиме аудита rewritten_* не запрашиваются — на всякий случай
    // выкидываем, если модель их всё-таки прислала (при жёсткой JSON-схеме
    // это невозможно, но mocks в тестах могут вернуть).
    delete finalData.rewritten_objective;
    delete finalData.rewritten_key_results;
    delete finalData.rewritten_objective_warning;

    // Извлекаем служебное __model_used и нормализуем в публичное поле model_used.
    const modelUsed = typeof finalData.__model_used === "string"
      ? finalData.__model_used
      : undefined;
    delete finalData.__model_used;
    if (modelUsed) finalData.model_used = modelUsed;

    // Серверная переопределение severity: канонический источник истины —
    // severityFor(id, horizon), а не то, что вернула модель. Делаем ДО
    // applyScoreRecompute, чтобы пересчёт шёл по каноническим весам.
    if (Array.isArray(finalData.rules)) {
      // Каноническая severity, применимость (OKR-PI 3.4.8) и серверное OKR-TYPE-DECLARED.
      const krTexts = enriched.map((k: any) => String(k?.text ?? ""));
      finalData.rules = addServerRules(finalData.rules, krTexts, finalData.kr_perspectives, ctx, String(objective));
      finalData.rules = applyRuleContext(finalData.rules, ctx);
    }



    // Серверная проверка обоснованности: для каждого правила добавляем
    // computed-поле grounded (не доверяя самооценке модели, не переопределяя pass/severity).
    const objectiveText = String(objective).trim();
    const krHaystack: string[] = enriched.map((k: any) => {
      const parts: string[] = [String(k?.text ?? "")];
      if (k?.baseline) parts.push(String(k.baseline));
      if (k?.target) parts.push(String(k.target));
      if (k?.metric) parts.push(String(k.metric));
      return parts.join(" ");
    });
    if (Array.isArray(finalData.rules)) {
      finalData.rules = finalData.rules.map((r: any) => ({
        ...r,
        // OKR-TYPE-DECLARED считает сервер — цитата не нужна.
        grounded: evidenceKindOf(String(r?.id ?? "")) === "server" ? true : isGrounded(r, objectiveText, krHaystack),
      }));
      finalData.rules = markUnconfirmed(finalData.rules);
    }

    // Оценка всегда считается сервером — после контекста правил и проверки цитат.
    applyScoreRecompute(finalData, h);

    return json(finalData);
  } catch (e) {
    console.error("validate-okr error", e);
    return errorJson(e instanceof Error ? e.message : "Unknown error", 500);
  }
};

Deno.serve(handler);
