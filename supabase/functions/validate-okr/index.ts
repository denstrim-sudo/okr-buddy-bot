import { handleCors, callAITool, errorJson, json } from "../_shared/ai.ts";
import { getRulesBlock } from "../_shared/okr_rules.ts";
import { buildExtraBlock } from "../_shared/ai.ts";
import { containsDigits } from "../_shared/textGuards.ts";
import { recomputeScore, scoreDiscrepancy, severityFor, type ScoringRule } from "../_shared/scoring.ts";

export const buildSystemPrompt = (horizon: string) => `You are an expert OKR Coach auditing an OKR using John Doerr's methodology and the OKR-PI framework.

HORIZON OF THIS OKR: ${horizon}${horizon === "quarter_3m" ? " — применяй КВАРТАЛЬНЫЙ набор правил (с overrides KR10→critical и доп. правилами Q-Focus, Q-Theme, Q-Reach)." : ""}

Given an Objective and a list of Key Results, evaluate them against these RULES (canonical, identical to those used by the drafter):

${getRulesBlock(horizon)}

For EACH rule you MUST return:
- "severity": уровень важности замечания
  - "critical" — без исправления OKR методологически некорректен
  - "important" — снижает качество и управляемость, но OKR работоспособен
  - "improve" — точечное усиление: стилистика, уточнение сегмента, более конкретная метрика
  - Для pass=true ставь "improve" (или опускай).
- "why": ОДНО короткое предложение на русском (≤140 символов), почему это важно. Для pass=true можно оставить пустым.

ВАЖНО про O2 + O3: горизонт OKR уже зафиксирован отдельным полем "horizon" (передан выше). НЕ требуй и НЕ вписывай в rewritten_objective дат, годов, кварталов, процентов или любых других цифр — это нарушит правило O3. Цифры допустимы ТОЛЬКО внутри Key Results (baseline/target).

Return STRICT JSON only via the provided tool.

IMPORTANT: All text fields (label, hint, why, summary, suggestion, rewritten_*) MUST be in RUSSIAN. Rule ids and enum values stay English.`;

const PARAMETERS = {
  type: "object",
  properties: {
    score: { type: "number", description: "0-100 overall validation score" },
    status: { type: "string", enum: ["pass", "warn", "fail"] },
    summary: { type: "string", description: "Short overall verdict in Russian." },
    rules: {
      type: "array", minItems: 5,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          pass: { type: "boolean" },
          hint: { type: "string" },
          severity: { type: "string", enum: ["critical", "important", "improve"] },
          why: { type: "string" },
        },
        required: ["id", "label", "pass", "hint", "severity", "why"],
        additionalProperties: false,
      },
    },
    rewritten_objective: { type: "string" },
    rewritten_key_results: { type: "array", items: { type: "string" } },
  },
  required: ["score", "status", "summary", "rules", "rewritten_objective", "rewritten_key_results"],
  additionalProperties: false,
};

const SANITIZE_HINT = "Твой предыдущий rewritten_objective содержал цифры, что нарушает правило O3. Перепиши rewritten_objective и rewritten_key_results без единой цифры в Objective, сохранив смысл. Цифры в Key Results (target/baseline) — оставь как есть, они разрешены.";

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
 * Серверный пересчёт score: если ответ модели расходится с канонической формулой
 * больше чем на 10 пунктов — подменяем data.score и ставим флаг score_recomputed.
 * Severity берётся из правила, при отсутствии — из severityFor(rule.id, horizon).
 */
export function applyScoreRecompute<T extends { score?: number; rules?: any[]; score_recomputed?: boolean }>(
  data: T,
  horizon?: string,
): T {
  if (!data || !Array.isArray(data.rules) || data.rules.length === 0) return data;
  const normalized: ScoringRule[] = data.rules.map((r: any) => ({
    id: typeof r?.id === "string" ? r.id : undefined,
    pass: Boolean(r?.pass),
    severity: r?.severity === "critical" || r?.severity === "important" || r?.severity === "improve"
      ? r.severity
      : (typeof r?.id === "string" ? severityFor(r.id, horizon) : "improve"),
  }));
  const recomputed = recomputeScore(normalized);
  const modelScore = typeof data.score === "number" ? data.score : 0;
  if (scoreDiscrepancy(modelScore, recomputed)) {
    data.score = recomputed;
    data.score_recomputed = true;
  }
  return data;
}

export const handler = async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { objective, key_results, key_results_full, horizon, extra_context, model } = await req.json();
    if (!objective || typeof objective !== "string" || objective.trim().length < 3) {
      return errorJson("Objective is required (min 3 chars)", 400);
    }
    if (!Array.isArray(key_results) || key_results.length === 0) {
      return errorJson("At least one Key Result is required", 400);
    }
    const h: string = horizon === "strategic_3y" || horizon === "block_12m" || horizon === "quarter_3m" ? horizon : "block_12m";

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
      "ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ (используй как дополнительные правила и контекст при аудите):",
    );
    const userPrompt = `OBJECTIVE: ${objective.trim()}\n\nKEY RESULTS (с метаданными baseline/target/metric/type, если есть):\n${krList}${extraBlock}\n\nAudit this OKR and return per-rule findings, overall score (0-100), summary, rewritten Objective + KRs. В rewritten_objective НЕ должно быть цифр (это нарушит O3). В переписанных KR сохраняй существующие baseline/target/metric, если они уже корректны.`;

    const systemPrompt = buildSystemPrompt(h);
    const modelArg = typeof model === "string" && model ? model : undefined;

    const first = await callAITool({
      systemPrompt,
      userPrompt,
      toolName: "validate_okr",
      toolDescription: "Audit an OKR and return rule-by-rule findings.",
      parameters: PARAMETERS,
      model: modelArg,
    });
    if (first.status !== 200) return first;
    const firstData = await first.json();

    const finalData = await sanitizeRewrittenObjective(firstData, async () => {
      const retryPrompt = `${userPrompt}\n\nВАЖНО: ${SANITIZE_HINT}`;
      const r = await callAITool({
        systemPrompt,
        userPrompt: retryPrompt,
        toolName: "validate_okr",
        toolDescription: "Audit an OKR and return rule-by-rule findings.",
        parameters: PARAMETERS,
        model: modelArg,
      });
      if (r.status !== 200) {
        // redo не удался — оставляем первый ответ как есть; sanitize пометит warning.
        return firstData;
      }
      return await r.json();
    });

    return json(finalData);
  } catch (e) {
    console.error("validate-okr error", e);
    return errorJson(e instanceof Error ? e.message : "Unknown error", 500);
  }
};

Deno.serve(handler);
