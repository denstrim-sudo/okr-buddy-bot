import { handleCors, callAITool, errorJson, buildExtraBlock, json } from "../_shared/ai.ts";
import { getRulesBlock } from "../_shared/okr_rules.ts";

const buildSystemPrompt = (horizon: string) => `You are an expert OKR Coach (Doerr methodology) drafting a SINGLE OKR.

${getRulesBlock(horizon)}

После составления черновика ОБЯЗАТЕЛЬНО прогони его мысленно по этим же правилам и заполни:
- "score_hint" — по формуле выше (с учётом потолка ≤60 при критических фейлах).
- "self_audit.critical_fails" — массив ID правил severity=critical, которые НЕ прошли (например ["O3","KR2"]). Пустой, если всё ок.
- "self_audit.important_fails" — массив ID правил severity=important, которые НЕ прошли.
Эти поля должны быть согласованы с score_hint: если в critical_fails что-то есть — score_hint ≤ 60.

Canonical hierarchy in this product:
Strategy -> Strategic OKR (3 years, "strategic_3y") -> Block OKR (12 months, "block_12m") -> Quarter OKR (3 months, "quarter_3m") -> Decisions / Solutions.

HARD RULES:
- The "horizon" field in your response MUST be EXACTLY equal to the HORIZON value sent in the user message. Do NOT change it. Same for "horizon_fit.horizon".
- Exactly 1 Objective.
- Between 1 and 3 Key Results. Never more than 3.
- Each KR must be an OUTCOME, not an activity/task. Forbidden root verbs: "провести", "поддержать", "запустить", "построить", "разработать", "внедрить", "conduct", "support", "build", "launch", "develop", "ship".
- At least one KR should be a LEADING (predictive) indicator if at all possible.
- If baseline / target / metric is unknown — leave that field empty AND add an entry to the KR's "warnings" (e.g. "нет baseline") and to "assumptions". NEVER invent numbers the user did not give.
- Horizon awareness:
  - strategic_3y: 3-year ambitious outcomes, no quarterly framing. Targets are directional/long-term, possibly category-defining ("стать №1 в сегменте", "выйти на 3 новых рынка").
  - block_12m: achievable inside a 12-month annual cycle, concrete numeric metrics, no multi-year horizons like "к 2028".
  - quarter_3m: укладывается в один квартал (≤90 дней). Objective — одна фокус-тема квартала. KR — конкретные числовые исходы, достижимые за 3 месяца от baseline. ЗАПРЕЩЕНЫ годовые и многолетние формулировки ("по итогам года", "к 2028", "за год"). Желательно ≥1 LEADING KR, потому что за квартал LAG-метрики часто не успевают сдвинуться. Если запрошенный target явно требует >1 квартала — добавь в warnings "target недостижим за квартал, рассмотрите разбивку".
- Mode:
  - from_scratch: produce a fresh OKR.
  - rewrite_existing: PRESERVE intent and recognizable wording from parsed_existing. Make MINIMAL edits.
- DO NOT generate solutions, bets, hypotheses or actions.
- "score_hint": honest 0-100 self-estimate of draft quality.

HORIZON FIT SELF-CHECK (REQUIRED in "horizon_fit"):
After drafting, evaluate how well YOUR OWN Objective and each KR fit the requested horizon.
- For Objective and each KR: verdict = "fits" | "too_short" (формулировка слишком краткосрочная) | "too_long" (слишком долгосрочная) | "mixed".
- "reason" — 1 предложение на русском.
- "suggestion" — переформулированный текст под горизонт (если verdict != "fits").
- "overall_verdict" + "overall_score" 0-100 — агрегированная оценка.
- "notes" — общие замечания («нет временных маркеров», «target выглядит как квартальный» и т.п.).
- Если в запросе focus_horizon_fit=true — ОСОБЕННО строго переформулируй KR под горизонт, используя prior_horizon_fit как обратную связь.

ALL text fields in RUSSIAN. Enum values stay English. Return STRICT JSON via the tool.`;

const HORIZON_FIT_ITEM = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["fits", "too_short", "too_long", "mixed"] },
    reason: { type: "string" },
    suggestion: { type: "string" },
  },
  required: ["verdict", "reason"],
  additionalProperties: false,
};

const PARAMETERS = {
  type: "object",
  properties: {
    horizon: { type: "string", enum: ["strategic_3y", "block_12m", "quarter_3m"] },
    mode: { type: "string", enum: ["from_scratch", "rewrite_existing"] },
    objective: { type: "string" },
    key_results: {
      type: "array", minItems: 1, maxItems: 4,
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          baseline: { type: "string" },
          target: { type: "string" },
          metric: { type: "string" },
          kr_type: { type: "string", enum: ["leading", "lagging"] },
          is_outcome: { type: "boolean" },
          assumptions: { type: "array", items: { type: "string" } },
          warnings: { type: "array", items: { type: "string" } },
        },
        required: ["text", "kr_type", "is_outcome", "assumptions", "warnings"],
        additionalProperties: false,
      },
    },
    global_assumptions: { type: "array", items: { type: "string" } },
    global_warnings: { type: "array", items: { type: "string" } },
    score_hint: { type: "number" },
    self_audit: {
      type: "object",
      properties: {
        critical_fails: { type: "array", items: { type: "string" } },
        important_fails: { type: "array", items: { type: "string" } },
      },
      required: ["critical_fails", "important_fails"],
      additionalProperties: false,
    },
    horizon_fit: {
      type: "object",
      properties: {
        horizon: { type: "string", enum: ["strategic_3y", "block_12m", "quarter_3m"] },
        overall_verdict: { type: "string", enum: ["fits", "too_short", "too_long", "mixed"] },
        overall_score: { type: "number" },
        objective: HORIZON_FIT_ITEM,
        key_results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: { type: "number" },
              verdict: { type: "string", enum: ["fits", "too_short", "too_long", "mixed"] },
              reason: { type: "string" },
              suggestion: { type: "string" },
            },
            required: ["index", "verdict", "reason"],
            additionalProperties: false,
          },
        },
        notes: { type: "array", items: { type: "string" } },
      },
      required: ["horizon", "overall_verdict", "overall_score", "objective", "key_results", "notes"],
      additionalProperties: false,
    },
  },
  required: ["horizon", "mode", "objective", "key_results", "global_assumptions", "global_warnings", "score_hint", "self_audit", "horizon_fit"],
  additionalProperties: false,
};

export function capKeyResults<T extends { key_results?: any; horizon_fit?: any }>(data: T, horizon: string): T {
  const maxKr = horizon === "quarter_3m" ? 4 : 3;
  if (data && Array.isArray((data as any).key_results) && (data as any).key_results.length > maxKr) {
    (data as any).key_results = (data as any).key_results.slice(0, maxKr);
    if ((data as any).horizon_fit && Array.isArray((data as any).horizon_fit.key_results)) {
      (data as any).horizon_fit.key_results = (data as any).horizon_fit.key_results.filter(
        (k: any) => k.index < maxKr,
      );
    }
  }
  return data;
}

export const handler = async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const {
      raw_input, horizon, mode, interpretation, clarifying_answers,
      extra_context, model, focus_horizon_fit, prior_horizon_fit,
    } = await req.json();
    if (!raw_input || typeof raw_input !== "string" || raw_input.trim().length < 3) {
      return errorJson("raw_input is required", 400);
    }
    const h: string = horizon === "strategic_3y" || horizon === "block_12m" || horizon === "quarter_3m" ? horizon : "block_12m";
    const m: string = mode === "rewrite_existing" ? "rewrite_existing" : "from_scratch";

    const interpBlock = interpretation
      ? `\n\nINTERPRETATION CONTEXT:\n${JSON.stringify(interpretation, null, 2).slice(0, 6000)}`
      : "";
    const answersBlock = Array.isArray(clarifying_answers) && clarifying_answers.length
      ? `\n\nCLARIFYING ANSWERS FROM USER (in order):\n${clarifying_answers.map((a: string, i: number) => `Q${i + 1}: ${String(a).trim() || "(skipped)"}`).join("\n")}`
      : "";
    const extraBlock = buildExtraBlock(extra_context, "ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ (методология / контекст):");
    const focusBlock = focus_horizon_fit
      ? `\n\nFOCUS_HORIZON_FIT: true — переформулируй KR так, чтобы они строго соответствовали горизонту ${h}.${prior_horizon_fit ? `\nPRIOR_HORIZON_FIT (что было не так в прошлой попытке):\n${JSON.stringify(prior_horizon_fit, null, 2).slice(0, 4000)}` : ""}`
      : "";

    const userPrompt = `HORIZON: ${h}\nMODE: ${m}\n\nIMPORTANT: response field "horizon" MUST equal "${h}" exactly. Same for horizon_fit.horizon. Do not change it to anything else.\n\nORIGINAL USER INPUT:\n${raw_input.trim()}${interpBlock}${answersBlock}${focusBlock}${extraBlock}\n\nDraft 1 Objective and 1..3 outcome-oriented Key Results, then fill horizon_fit self-check. NO solutions.`;

    const res = await callAITool({
      systemPrompt: buildSystemPrompt(h),
      userPrompt,
      toolName: "draft_okr",
      toolDescription: "Draft a single Objective with 1..3 outcome-based Key Results plus horizon-fit self-check.",
      parameters: PARAMETERS,
      model: typeof model === "string" && model ? model : undefined,
    });

    try {
      const data = await res.clone().json();
      if (data && typeof data === "object" && !data.error) {
        // Force horizon to match request — модель иногда возвращает прошлый дефолт.
        data.horizon = h;
        if (data.horizon_fit && typeof data.horizon_fit === "object") {
          data.horizon_fit.horizon = h;
        }
        if (Array.isArray(data.key_results)) {
          capKeyResults(data, h);
        }
        return json(data);
      }
    } catch { /* pass through */ }
    return res;
  } catch (e) {
    console.error("draft-okr error", e);
    return errorJson(e instanceof Error ? e.message : "Unknown error", 500);
  }
};

Deno.serve(handler);
