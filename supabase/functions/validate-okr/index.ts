import { handleCors, callAITool, errorJson, buildExtraBlock } from "../_shared/ai.ts";

const SYSTEM_PROMPT = `You are an expert OKR Coach auditing an OKR using John Doerr's methodology and the OKR-PI framework.

Given an Objective and a list of Key Results, evaluate them against these RULES:
- O1: Objective is qualitative and inspiring (not a metric)
- O2: Objective is ambitious, time-bound, memorable
- O3: Objective contains NO KPIs, percentages or numbers
- KR1: Each KR is measurable (a number/metric, not an activity)
- KR2: Each KR has explicit baseline and target (FROM → TO)
- KR3: KRs describe OUTCOMES, not tasks/activities (no "conduct", "support", "build", "launch")
- KR4: KRs are time-bound and have a progress gradient (not binary)
- KR10: At least one KR is a LEADING (predictive) indicator

Return STRICT JSON only via the provided tool.

IMPORTANT: All text fields (label, hint, summary, suggestion, rewritten_*) MUST be in RUSSIAN. Rule ids stay as codes (O1, KR1, etc.). status enum stays English.`;

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
          id: { type: "string", description: "Rule code, e.g. O1, KR2" },
          label: { type: "string", description: "Short rule label in Russian." },
          pass: { type: "boolean" },
          hint: { type: "string", description: "Short suggestion in Russian if failing, else empty." },
        },
        required: ["id", "label", "pass", "hint"],
        additionalProperties: false,
      },
    },
    rewritten_objective: { type: "string" },
    rewritten_key_results: { type: "array", items: { type: "string" } },
  },
  required: ["score", "status", "summary", "rules", "rewritten_objective", "rewritten_key_results"],
  additionalProperties: false,
};

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { objective, key_results, extra_context } = await req.json();
    if (!objective || typeof objective !== "string" || objective.trim().length < 3) {
      return errorJson("Objective is required (min 3 chars)", 400);
    }
    if (!Array.isArray(key_results) || key_results.length === 0) {
      return errorJson("At least one Key Result is required", 400);
    }

    const krList = (key_results as string[])
      .map((k, i) => `KR${i + 1}: ${String(k).trim()}`)
      .filter((s) => s.length > 4)
      .join("\n");

    const extraBlock = buildExtraBlock(
      extra_context,
      "ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ (используй как дополнительные правила и контекст при аудите):",
    );
    const userPrompt = `OBJECTIVE: ${objective.trim()}\n\nKEY RESULTS:\n${krList}${extraBlock}\n\nAudit this OKR and return per-rule findings, an overall score (0-100), a short summary, and rewritten Objective + KRs aligned with Doerr methodology.`;

    return await callAITool({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      toolName: "validate_okr",
      toolDescription: "Audit an OKR and return rule-by-rule findings.",
      parameters: PARAMETERS,
    });
  } catch (e) {
    console.error("validate-okr error", e);
    return errorJson(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
