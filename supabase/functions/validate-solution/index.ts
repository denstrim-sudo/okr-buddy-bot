import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.105.1/cors";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { objective, key_result, solution } = await req.json();
    if (!solution || typeof solution !== "object") {
      return new Response(JSON.stringify({ error: "solution object is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const required = ["problem", "bet", "result_image", "leading_metric"];
    for (const f of required) {
      if (!solution[f] || String(solution[f]).trim().length < 2) {
        return new Response(JSON.stringify({ error: `Field "${f}" is required` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const krText = typeof key_result === "string" ? key_result : key_result?.text;

    const userPrompt = `OBJECTIVE: ${objective || "(not provided)"}\nKEY RESULT: ${krText || "(not provided)"}\n\nSOLUTION:\n- Problem: ${solution.problem}\n- Bet: ${solution.bet}\n- Result image: ${solution.result_image}\n- Leading metric: ${solution.leading_metric}\n- Confidence: ${solution.confidence ?? "-"}\n- Effort: ${solution.effort ?? "-"}\n- Validation: ${solution.validation ?? "-"}\n\nAudit and return the report.`;

    const tool = {
      type: "function",
      function: {
        name: "audit_solution",
        description: "Audit a single Solution and return a structured report.",
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
      },
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "audit_solution" } },
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const txt = await response.text();
      console.error("AI gateway error", response.status, txt);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "No structured output returned" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const args = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(args), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("validate-solution error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
