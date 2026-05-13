import { handleCors, callAITool, errorJson, buildExtraBlock, json } from "../_shared/ai.ts";

const SYSTEM_PROMPT = `You are an expert OKR Coach (Doerr methodology) drafting a SINGLE OKR.

Canonical hierarchy in this product:
Strategy -> Strategic OKR (3 years, "strategic_3y") -> Block OKR (12 months, "block_12m") -> Decisions / Solutions.
Quarterly OKRs are NOT used here.

HARD RULES:
- Exactly 1 Objective.
- Between 1 and 3 Key Results. Never more than 3.
- Each KR must be an OUTCOME, not an activity/task. Forbidden root verbs: "провести", "поддержать", "запустить", "построить", "разработать", "внедрить", "conduct", "support", "build", "launch", "develop", "ship".
- At least one KR should be a LEADING (predictive) indicator if at all possible.
- If baseline / target / metric is unknown — leave that field empty AND add an entry to the KR's "warnings" (e.g. "нет baseline") and to "assumptions" describing what the model would assume. NEVER invent numbers that the user did not give.
- Horizon awareness:
  - strategic_3y: 3-year ambitious outcomes, no quarterly framing. Targets are directional/long-term.
  - block_12m: achievable inside a 12-month annual cycle, more concrete metrics.
- Mode awareness:
  - from_scratch: produce a fresh OKR.
  - rewrite_existing: PRESERVE the user's intent and recognizable wording from parsed_existing. Make MINIMAL edits — only what is required to fix outcome-orientation, measurability, or methodology violations. Do not invent a new theme.
- DO NOT generate solutions, bets, hypotheses or actions. This step produces ONLY Objective + KRs.
- "score_hint": your honest 0-100 self-estimate of draft quality (will be re-audited later).

ALL text fields in RUSSIAN. Enum values stay English. Return STRICT JSON via the tool.`;

const PARAMETERS = {
  type: "object",
  properties: {
    horizon: { type: "string", enum: ["strategic_3y", "block_12m"] },
    mode: { type: "string", enum: ["from_scratch", "rewrite_existing"] },
    objective: { type: "string" },
    key_results: {
      type: "array", minItems: 1, maxItems: 3,
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
  },
  required: ["horizon", "mode", "objective", "key_results", "global_assumptions", "global_warnings", "score_hint"],
  additionalProperties: false,
};

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { raw_input, horizon, mode, interpretation, clarifying_answers, extra_context, model } = await req.json();
    if (!raw_input || typeof raw_input !== "string" || raw_input.trim().length < 3) {
      return errorJson("raw_input is required", 400);
    }
    const h: string = horizon === "strategic_3y" || horizon === "block_12m" ? horizon : "block_12m";
    const m: string = mode === "rewrite_existing" ? "rewrite_existing" : "from_scratch";

    const interpBlock = interpretation
      ? `\n\nINTERPRETATION CONTEXT:\n${JSON.stringify(interpretation, null, 2).slice(0, 6000)}`
      : "";
    const answersBlock = Array.isArray(clarifying_answers) && clarifying_answers.length
      ? `\n\nCLARIFYING ANSWERS FROM USER (in order):\n${clarifying_answers.map((a: string, i: number) => `Q${i + 1}: ${String(a).trim() || "(skipped)"}`).join("\n")}`
      : "";
    const extraBlock = buildExtraBlock(extra_context, "ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ (методология / контекст):");

    const userPrompt = `HORIZON: ${h}\nMODE: ${m}\n\nORIGINAL USER INPUT:\n${raw_input.trim()}${interpBlock}${answersBlock}${extraBlock}\n\nDraft 1 Objective and 1..3 outcome-oriented Key Results following the rules. If facts are missing — leave fields empty and record assumptions/warnings. NO solutions.`;

    const res = await callAITool({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      toolName: "draft_okr",
      toolDescription: "Draft a single Objective with 1..3 outcome-based Key Results.",
      parameters: PARAMETERS,
      model: typeof model === "string" && model ? model : undefined,
    });

    // Hard cap to 3 KR on the server side, in case the model overshoots.
    try {
      const data = await res.clone().json();
      if (data && Array.isArray(data.key_results) && data.key_results.length > 3) {
        data.key_results = data.key_results.slice(0, 3);
        return json(data);
      }
    } catch { /* pass through original response */ }
    return res;
  } catch (e) {
    console.error("draft-okr error", e);
    return errorJson(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
