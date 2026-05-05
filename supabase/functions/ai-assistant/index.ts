/**
 * Central AI Assistant Edge Function — routes all assistant actions to OpenAI.
 *
 * Supported modes:
 *   - "generate_okr"        : generates Key Results + Solutions for an Objective.
 *     context: { objective: string, context?: string, extra_context?: string }
 *
 *   - "validate_okr"        : audits an OKR against Doerr/OKR-PI rules.
 *     context: { objective: string, key_results: string[], key_results_full?: any[], extra_context?: string }
 *
 *   - "generate_solutions"  : generates 3-5 strategic Solutions for one KR.
 *     context: { objective: string, key_result: string|object, context?: string, extra_context?: string }
 *
 *   - "validate_solution"   : audits one Solution.
 *     context: { objective?: string, key_result?: string|object, solution: object, extra_context?: string }
 *
 * Request body:
 *   {
 *     mode: <one of the above>,
 *     userInput?: string,
 *     context: object,
 *     systemConfig?: {
 *       model?: "gpt-4.1" | "gpt-4.1-mini",   // default gpt-4.1-mini
 *       temperature?: number,                  // default 0.4
 *       maxTokens?: number,                    // default 4000
 *       strictness?: "soft" | "normal" | "strict",
 *       language?: string                      // default ru-RU
 *     }
 *   }
 *
 * Response body:
 *   {
 *     result: object | null,            // structured JSON for the UI
 *     rawModelResponse: string,         // model output (for debugging)
 *     usage: { prompt_tokens, completion_tokens, total_tokens } | null,
 *     error: { code, message, retryable } | null
 *   }
 *
 * Uses AIAI.BY (OpenAI-compatible gateway, https://aiai.by/docs, base
 * https://vedai.by/api/v1) /chat/completions with tool calling (tool_choice
 * forced) to guarantee strict JSON. The AIAI_API_KEY secret is read from
 * Deno.env and never exposed to the client. Supported models include
 * gpt-4o, gpt-4o-mini, claude-*, gemini-*, deepseek-* (see AIAI.BY docs).
 */

import { handleCors, callAIToolExtended, errorJson, buildExtraBlock } from "../_shared/ai.ts";

type Mode = "generate_okr" | "validate_okr" | "generate_solutions" | "validate_solution";

const STRICTNESS_HINT: Record<string, string> = {
  soft: "Будь снисходителен — отмечай только серьёзные нарушения.",
  normal: "Применяй правила со средней строгостью.",
  strict: "Будь максимально строг — любое нарушение правил снижает оценку.",
};

const SHARED_SUFFIX = `\n\nALL text fields MUST be in RUSSIAN unless explicitly an enum. Return STRICT JSON only via the provided tool.`;

const MODE_REGISTRY: Record<Mode, {
  toolName: string;
  toolDescription: string;
  systemPrompt: string;
  parameters: Record<string, unknown>;
  buildUserPrompt: (ctx: any, userInput?: string) => string;
  validate: (ctx: any) => string | null;
}> = {
  generate_okr: {
    toolName: "generate_okr_plan",
    toolDescription: "Return generated Key Results and Solutions for the given Objective.",
    systemPrompt: `You are an expert OKR Coach (Doerr + OKR-PI). Generate 2-4 measurable outcome-based Key Results (with baseline/target/metric, at least one leading) and 2-3 strategic Solutions per KR. Solutions must follow the «Если мы … то это приведёт к тому, что … и повлияет на … , потому что …» Russian template.${SHARED_SUFFIX}`,
    parameters: {
      type: "object",
      properties: {
        objective_refined: { type: "string" },
        score: { type: "number" },
        key_results: {
          type: "array", minItems: 2, maxItems: 4,
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              baseline: { type: "string" },
              target: { type: "string" },
              metric: { type: "string" },
              kr_type: { type: "string", enum: ["leading", "lagging"] },
              solutions: {
                type: "array", minItems: 2, maxItems: 3,
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    problem: { type: "string" },
                    bet: { type: "string" },
                    result_image: { type: "string" },
                    leading_metric: { type: "string" },
                    confidence: { type: "string", enum: ["Low", "Medium", "High"] },
                    effort: { type: "string", enum: ["S", "M", "L", "XL"] },
                    validation: { type: "string" },
                  },
                  required: ["id", "problem", "bet", "result_image", "leading_metric", "confidence", "effort", "validation"],
                  additionalProperties: false,
                },
              },
            },
            required: ["text", "baseline", "target", "metric", "kr_type", "solutions"],
            additionalProperties: false,
          },
        },
      },
      required: ["objective_refined", "score", "key_results"],
      additionalProperties: false,
    },
    validate: (ctx) => (!ctx?.objective || String(ctx.objective).trim().length < 3 ? "context.objective is required" : null),
    buildUserPrompt: (ctx, userInput) => {
      const extra = buildExtraBlock(ctx?.extra_context, "ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ:");
      return `OBJECTIVE: ${String(ctx.objective).trim()}\n\nCONTEXT: ${(ctx.context || userInput || "").toString().trim() || "(none)"}${extra}\n\nGenerate 2-4 Key Results and 2-3 Solutions per KR.`;
    },
  },

  validate_okr: {
    toolName: "validate_okr",
    toolDescription: "Audit an OKR and return rule-by-rule findings.",
    systemPrompt: `You are an expert OKR Coach auditing an OKR (Doerr + OKR-PI). Evaluate against rules O1-O3, KR1-KR4, KR10. Return per-rule pass/hint, overall score 0-100, status, summary, rewritten_objective, rewritten_key_results.${SHARED_SUFFIX}`,
    parameters: {
      type: "object",
      properties: {
        score: { type: "number" },
        status: { type: "string", enum: ["pass", "warn", "fail"] },
        summary: { type: "string" },
        rules: {
          type: "array", minItems: 5,
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
        rewritten_objective: { type: "string" },
        rewritten_key_results: { type: "array", items: { type: "string" } },
      },
      required: ["score", "status", "summary", "rules", "rewritten_objective", "rewritten_key_results"],
      additionalProperties: false,
    },
    validate: (ctx) => {
      if (!ctx?.objective || String(ctx.objective).trim().length < 3) return "context.objective is required";
      if (!Array.isArray(ctx?.key_results) || ctx.key_results.length === 0) return "context.key_results is required";
      return null;
    },
    buildUserPrompt: (ctx) => {
      const enriched = Array.isArray(ctx.key_results_full) && ctx.key_results_full.length
        ? ctx.key_results_full
        : (ctx.key_results as string[]).map((t: string) => ({ text: String(t) }));
      const krList = enriched.map((k: any, i: number) => {
        const text = String(k?.text ?? "").trim();
        const meta: string[] = [];
        if (k?.baseline) meta.push(`baseline: ${k.baseline}`);
        if (k?.target) meta.push(`target: ${k.target}`);
        if (k?.metric) meta.push(`metric: ${k.metric}`);
        if (k?.kr_type) meta.push(`type: ${k.kr_type}`);
        return `KR${i + 1}: ${text}${meta.length ? `\n  (${meta.join(" · ")})` : ""}`;
      }).join("\n");
      const extra = buildExtraBlock(ctx?.extra_context, "ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ:");
      return `OBJECTIVE: ${String(ctx.objective).trim()}\n\nKEY RESULTS:\n${krList}${extra}\n\nAudit and return findings.`;
    },
  },

  generate_solutions: {
    toolName: "generate_solutions",
    toolDescription: "Return generated strategic Solutions for the given KR.",
    systemPrompt: `You are a Strategic Hypothesis Coach (OKR-PI). Generate 3-5 strategic Solutions (problem/bet/result_image/leading_metric/confidence/effort/validation). The "bet" MUST follow the Russian template «Если мы … , то это приведёт к тому, что … и повлияет на … , потому что … .». Never use implementation verbs as core verb.${SHARED_SUFFIX}`,
    parameters: {
      type: "object",
      properties: {
        solutions: {
          type: "array", minItems: 3, maxItems: 5,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              problem: { type: "string" },
              bet: { type: "string" },
              result_image: { type: "string" },
              leading_metric: { type: "string" },
              confidence: { type: "string", enum: ["Low", "Medium", "High"] },
              effort: { type: "string", enum: ["S", "M", "L", "XL"] },
              validation: { type: "string" },
            },
            required: ["id", "problem", "bet", "result_image", "leading_metric", "confidence", "effort", "validation"],
            additionalProperties: false,
          },
        },
      },
      required: ["solutions"],
      additionalProperties: false,
    },
    validate: (ctx) => {
      if (!ctx?.objective) return "context.objective is required";
      const krText = typeof ctx.key_result === "string" ? ctx.key_result : ctx?.key_result?.text;
      if (!krText) return "context.key_result is required";
      return null;
    },
    buildUserPrompt: (ctx) => {
      const kr = ctx.key_result;
      const krText = typeof kr === "string" ? kr : kr?.text;
      const krDetails = typeof kr === "object" && kr
        ? `KR: ${krText}\nBaseline: ${kr.baseline ?? "-"}\nTarget: ${kr.target ?? "-"}\nMetric: ${kr.metric ?? "-"}\nType: ${kr.kr_type ?? "-"}`
        : `KR: ${krText}`;
      const extra = buildExtraBlock(ctx?.extra_context, "ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ:");
      return `OBJECTIVE: ${String(ctx.objective).trim()}\n\n${krDetails}\n\nCONTEXT: ${(ctx.context || "").toString().trim() || "(none)"}${extra}\n\nGenerate 3-5 strategic Solutions.`;
    },
  },

  validate_solution: {
    toolName: "audit_solution",
    toolDescription: "Audit a single Solution and return a structured report.",
    systemPrompt: `You are a Strategic Hypothesis Auditor (OKR-PI). Audit ONE Solution against rules S1-S7 and return score 0-100, status (pass>=80, warn 50-79, fail<50), summary, rules and rewritten_solution.${SHARED_SUFFIX}`,
    parameters: {
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
    },
    validate: (ctx) => {
      if (!ctx?.solution || typeof ctx.solution !== "object") return "context.solution is required";
      for (const f of ["problem", "bet", "result_image", "leading_metric"]) {
        if (!ctx.solution[f] || String(ctx.solution[f]).trim().length < 2) return `solution.${f} is required`;
      }
      return null;
    },
    buildUserPrompt: (ctx) => {
      const krText = typeof ctx.key_result === "string" ? ctx.key_result : ctx?.key_result?.text;
      const s = ctx.solution;
      const extra = buildExtraBlock(ctx?.extra_context, "ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ:");
      return `OBJECTIVE: ${ctx.objective || "(not provided)"}\nKEY RESULT: ${krText || "(not provided)"}\n\nSOLUTION:\n- Problem: ${s.problem}\n- Bet: ${s.bet}\n- Result image: ${s.result_image}\n- Leading metric: ${s.leading_metric}\n- Confidence: ${s.confidence ?? "-"}\n- Effort: ${s.effort ?? "-"}\n- Validation: ${s.validation ?? "-"}${extra}\n\nAudit and return the report.`;
    },
  },
};

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorJson("Invalid JSON body", 400);
  }

  const { mode, userInput, context, systemConfig } = body ?? {};
  const def = MODE_REGISTRY[mode as Mode];
  if (!def) return errorJson(`Unknown mode: ${mode}`, 400);

  const validationErr = def.validate(context);
  if (validationErr) return errorJson(validationErr, 400);

  const strictness = systemConfig?.strictness ?? "normal";
  const lang = systemConfig?.language ?? "ru-RU";
  const systemPrompt = `${def.systemPrompt}\n\nLanguage: ${lang}. ${STRICTNESS_HINT[strictness] ?? ""}`;
  const userPrompt = def.buildUserPrompt(context ?? {}, userInput);

  return await callAIToolExtended({
    systemPrompt,
    userPrompt,
    toolName: def.toolName,
    toolDescription: def.toolDescription,
    parameters: def.parameters,
    model: systemConfig?.model,
    temperature: systemConfig?.temperature,
    maxTokens: systemConfig?.maxTokens,
  });
});
