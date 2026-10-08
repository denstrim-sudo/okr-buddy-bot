import { handleCors, callAITool, errorJson, buildExtraBlock, json } from "../_shared/ai.ts";
import { REASONING_RULES, extractDocNames, ensureDistinctVariants, type Reasoning } from "./reasoning.ts";

export const SYSTEM_PROMPT = `You are an OKR Intake Analyst. The canonical OKR hierarchy in this product is:
Strategy -> Strategic OKR (3 years, "strategic_3y") -> Block OKR (12 months, "block_12m") -> Quarter OKR (3 months, "quarter_3m") -> Decisions / Solutions.

Your job: take the user's free-form input (which may be raw context, a goal idea, or a pasted existing OKR), and INTERPRET it BEFORE drafting anything. Decide:
- detected_horizon: "strategic_3y", "block_12m" or "quarter_3m" — guided by the user's selected horizon, but override if input clearly says otherwise.
  - "quarter_3m" — явные маркеры: «квартал», «Q1»/«Q2»/«Q3»/«Q4», «3 месяца», «до конца квартала», «90 дней».
  - "block_12m" — «год», «годовой», конкретный год вроде «2026», «по итогам года».
  - "strategic_3y" — «3 года», «к 2028», «стратегия», «долгосрочно», «vision».
- detected_mode: "rewrite_existing" if input contains a recognizable Objective + Key Results structure (numbered KRs, "Objective:", "KR1:", etc.); else "from_scratch".
- topic_summary: 1-2 sentence neutral restatement of what the user is trying to achieve.
- has_existing_okr + parsed_existing: extract the objective and KR strings if present.
- missing_info: short list of what is missing for a quality OKR (baseline, target, metric, segment, time horizon, audience, etc.).
- clarifying_questions: 0..3 questions, ONLY if they are truly necessary to draft a useful OKR. Prefer 0 if you can draft with reasonable assumptions. Each question must be specific and answerable in one short sentence.
- assumptions: defaults you would take if user skips clarifications.
- warnings: red flags (e.g. input describes activities not outcomes, no measurable signals).

${REASONING_RULES}

ALL text fields in RUSSIAN. Enum values stay English. Return STRICT JSON via the tool.`;

const PARAMETERS = {
  type: "object",
  properties: {
    reasoning: {
      type: "object",
      properties: {
        facts: {
          type: "array", minItems: 3, maxItems: 10,
          items: {
            type: "object",
            properties: { id: { type: "string" }, statement: { type: "string" }, source: { type: "string" } },
            required: ["id", "statement", "source"], additionalProperties: false,
          },
        },
        tensions: {
          type: "array", minItems: 1, maxItems: 4,
          items: {
            type: "object",
            properties: {
              id: { type: "string" }, gap: { type: "string" }, who_affected: { type: "string" },
              evidence_fact_ids: { type: "array", items: { type: "string" } },
            },
            required: ["id", "gap", "who_affected", "evidence_fact_ids"], additionalProperties: false,
          },
        },
        variants: {
          type: "array", minItems: 2, maxItems: 3,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              bet_axis: { type: "string", enum: ["customer_business", "feasibility_risk", "learning"] },
              bet_thesis: { type: "string" },
              objective_sketch: { type: "string" },
              kr_directions: { type: "array", items: { type: "string" } },
              supports_fact_ids: { type: "array", items: { type: "string" } },
              addresses_tension_ids: { type: "array", items: { type: "string" } },
              trade_off: { type: "string" },
              key_risk: { type: "string" },
              unknowns: { type: "array", items: { type: "string" } },
            },
            required: ["id", "bet_axis", "bet_thesis", "objective_sketch", "kr_directions", "supports_fact_ids", "addresses_tension_ids", "trade_off", "key_risk", "unknowns"],
            additionalProperties: false,
          },
        },
        choice_question: { type: "string" },
      },
      required: ["facts", "tensions", "variants", "choice_question"],
      additionalProperties: false,
    },
    detected_horizon: { type: "string", enum: ["strategic_3y", "block_12m", "quarter_3m"] },
    detected_mode: { type: "string", enum: ["from_scratch", "rewrite_existing"] },
    topic_summary: { type: "string" },
    has_existing_okr: { type: "boolean" },
    parsed_existing: {
      type: "object",
      properties: {
        objective: { type: "string" },
        key_results: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
    missing_info: { type: "array", items: { type: "string" } },
    clarifying_questions: { type: "array", maxItems: 3, items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "reasoning", "detected_horizon", "detected_mode", "topic_summary", "has_existing_okr",
    "missing_info", "clarifying_questions", "assumptions", "warnings",
  ],
  additionalProperties: false,
};

export const handler = async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { raw_input, horizon, extra_context, model, parent_kr_context } = await req.json();
    if (!raw_input || typeof raw_input !== "string" || raw_input.trim().length < 3) {
      return errorJson("raw_input is required (min 3 chars)", 400);
    }
    const horizonHint = horizon === "strategic_3y" || horizon === "block_12m" || horizon === "quarter_3m" ? horizon : "block_12m";
    const extraBlock = buildExtraBlock(extra_context, "ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ (методология / контекст):");
    const parentKrBlock = typeof parent_kr_context === "string" && parent_kr_context.trim()
      ? `\n\nPARENT KEY RESULT (каждый вариант должен явно продвигать именно этот KR родителя):\n${parent_kr_context.trim()}`
      : "";
    const userPrompt = `USER-SELECTED HORIZON: ${horizonHint}\n\nUSER INPUT:\n${raw_input.trim()}${parentKrBlock}${extraBlock}\n\nInterpret this input. Decide horizon, mode (rewrite_existing if a draft OKR is already pasted), extract any existing objective/KRs, list missing info, and generate at most 3 clarifying questions ONLY if truly needed.`;

    const modelArg = typeof model === "string" && model ? model : undefined;
    const call = (prompt: string) => callAITool({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: prompt,
      toolName: "interpret_okr_input",
      toolDescription: "Interpret free-form user input before drafting an OKR.",
      parameters: PARAMETERS,
      model: modelArg,
    });

    const res = await call(userPrompt);
    const data = await res.clone().json().catch(() => null);
    if (!data || data.error) return res;

    const docNames = extractDocNames(extra_context);
    const out = await ensureDistinctVariants(data.reasoning, async () => {
      const r2 = await call(`${userPrompt}\n\nПРЕДЫДУЩИЕ ВАРИАНТЫ НЕ РАЗЛИЧАЛИСЬ ПО bet_axis. Дай 2–3 варианта с РАЗНЫМИ осями.`);
      const d2 = await r2.json().catch(() => null);
      return d2 && !d2.error ? (d2.reasoning as Reasoning) : null;
    }, docNames);

    return json({
      ...data,
      reasoning: out.reasoning,
      reasoning_quality: out.quality,
      ...(out.warning ? { reasoning_warning: out.warning } : {}),
    }, res.status);
  } catch (e) {
    console.error("interpret-okr-input error", e);
    return errorJson(e instanceof Error ? e.message : "Unknown error", 500);
  }
};

Deno.serve(handler);
