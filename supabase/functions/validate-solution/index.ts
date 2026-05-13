import { handleCors, callAITool, errorJson, buildExtraBlock } from "../_shared/ai.ts";

const SYSTEM_PROMPT = `You are a Strategic Hypothesis Auditor in the OKR-PI framework.

Audit ONE Solution against these rules and return a strict JSON report:
S1. PROBLEM is real and specific (whose JTBD/pain — not vague)
S2. BET is a strategic hypothesis, NOT an implementation/feature ("build/launch/ship/develop" as core verb fails)
S3. RESULT IMAGE is observable from outside (a state, not an activity)
S4. LEADING METRIC is predictive and measurable (not a vanity metric, not lagging-only)
S5. Confidence and effort are coherent with validation approach
S6. Hypothesis links bet → outcome ("we believe... will lead to...") cleanly
S7. Aligns with the parent Objective and Key Result (moves the KR's metric)

Score 0-100. Status: pass (>=80), warn (50-79), fail (<50).
Provide a rewritten_solution with the same fields, optimized.

IMPORTANT: All text fields (summary, hint, rewritten_solution.*) MUST be in RUSSIAN. Enum values stay in English.

Return STRICT JSON only via the provided tool.`;

const PARAMETERS = {
  type: "object",
  properties: {
    score: { type: "number" },
    status: { type: "string", enum: ["pass", "warn", "fail"] },
    summary: { type: "string" },
    rules: {
      type: "array", minItems: 5, maxItems: 8,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          pass: { type: "boolean" },
          hint: { type: "string" },
        },
        required: ["id", "label", "pass", "hint"],
        additionalProperties: false,
      },
    },
    rewritten_solution: {
      type: "object",
      properties: {
        problem: { type: "string" },
        bet: { type: "string" },
        result_image: { type: "string" },
        leading_metric: { type: "string" },
        confidence: { type: "string", enum: ["Low", "Medium", "High"] },
        effort: { type: "string", enum: ["S", "M", "L", "XL"] },
        validation: { type: "string" },
      },
      required: ["problem", "bet", "result_image", "leading_metric", "confidence", "effort", "validation"],
      additionalProperties: false,
    },
  },
  required: ["score", "status", "summary", "rules", "rewritten_solution"],
  additionalProperties: false,
};

export const handler = async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { objective, key_result, solution, extra_context, model } = await req.json();
    if (!solution || typeof solution !== "object") return errorJson("solution object is required", 400);

    for (const f of ["problem", "bet", "result_image", "leading_metric"]) {
      if (!solution[f] || String(solution[f]).trim().length < 2) {
        return errorJson(`Field "${f}" is required`, 400);
      }
    }

    const krText = typeof key_result === "string" ? key_result : key_result?.text;
    const extraBlock = buildExtraBlock(
      extra_context,
      "ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ (методология и база знаний — используй при аудите):",
    );
    const userPrompt = `OBJECTIVE: ${objective || "(not provided)"}\nKEY RESULT: ${krText || "(not provided)"}\n\nSOLUTION:\n- Problem: ${solution.problem}\n- Bet: ${solution.bet}\n- Result image: ${solution.result_image}\n- Leading metric: ${solution.leading_metric}\n- Confidence: ${solution.confidence ?? "-"}\n- Effort: ${solution.effort ?? "-"}\n- Validation: ${solution.validation ?? "-"}${extraBlock}\n\nAudit and return the report.`;

    return await callAITool({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      toolName: "audit_solution",
      toolDescription: "Audit a single Solution and return a structured report.",
      parameters: PARAMETERS,
      model: typeof model === "string" && model ? model : undefined,
    });
  } catch (e) {
    console.error("validate-solution error", e);
    return errorJson(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
