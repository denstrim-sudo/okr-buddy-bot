import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.105.1/cors";

interface KeyResult {
  text: string;
  baseline: string;
  target: string;
  metric: string;
  kr_type: "leading" | "lagging";
}

interface Solution {
  id: string;
  problem: string;
  bet: string;
  result_image: string;
  leading_metric: string;
  confidence: "Low" | "Medium" | "High";
  effort: "S" | "M" | "L" | "XL";
  validation: string;
}

const SYSTEM_PROMPT = `You are an expert OKR Coach and Strategic Hypothesis Coach working in the OKR-PI framework (Doerr methodology + Program Increment).

Given an Objective and team context, you must:
1. Generate 2-4 Key Results that follow ALL these rules:
   - Each KR is a measurable OUTCOME (NOT activity, NOT task)
   - Each KR has a baseline and target ("from X to Y")
   - At least one KR is a LEADING (predictive) indicator
   - No verbs like "conduct", "support", "analyze", "participate"
   - Time-bound, with progress gradient (not binary)
2. For EACH Key Result, generate 2-3 Solutions (strategic bets, NOT features/tasks). Each Solution:
   - Describes the PROBLEM/JTBD first (whose pain?)
   - Has a RESULT IMAGE (success state seen from outside)
   - Is framed as a hypothesis: "We believe that [bet]... will lead to [result]..."
   - Names a LEADING metric expected to move
   - Includes confidence (Low/Medium/High), effort (S/M/L/XL), and a lightweight validation approach (prototype, A/B test, discovery sprint, spike, etc.)
   - Never use implementation language ("build", "launch", "develop", "ship") as the core verb

IMPORTANT: All generated text content (objective_refined, KR text, baseline, target, metric, problem, bet, result_image, leading_metric, validation) MUST be written in RUSSIAN language. Only the enum values (kr_type, confidence, effort) stay in English as they map to UI codes.

Return STRICT JSON only via the provided tool.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { objective, context, extra_context } = await req.json();
    if (!objective || typeof objective !== "string" || objective.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Objective is required (min 3 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extraBlock = typeof extra_context === "string" && extra_context.trim().length > 20
      ? `\n\nЗАГРУЖЕННЫЕ ДОКУМЕНТЫ (учитывай как авторитетный контекст и методологию):\n${extra_context.trim().slice(0, 12000)}`
      : "";

    const userPrompt = `OBJECTIVE: ${objective.trim()}\n\nCONTEXT: ${(context || "").trim() || "(none provided)"}${extraBlock}\n\nGenerate 2-4 Key Results and 2-3 Solutions per KR.`;

    const tool = {
      type: "function",
      function: {
        name: "generate_okr_plan",
        description: "Return generated Key Results and Solutions for the given Objective.",
        parameters: {
          type: "object",
          properties: {
            objective_refined: { type: "string", description: "Optionally improved/refined objective phrasing." },
            score: { type: "number", description: "Validation score 0-100 for the resulting OKR quality." },
            key_results: {
              type: "array",
              minItems: 2,
              maxItems: 4,
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  baseline: { type: "string" },
                  target: { type: "string" },
                  metric: { type: "string" },
                  kr_type: { type: "string", enum: ["leading", "lagging"] },
                  solutions: {
                    type: "array",
                    minItems: 2,
                    maxItems: 3,
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        problem: { type: "string" },
                        bet: { type: "string", description: "Strategic bet, no implementation verbs." },
                        result_image: { type: "string" },
                        leading_metric: { type: "string" },
                        confidence: { type: "string", enum: ["Low", "Medium", "High"] },
                        effort: { type: "string", enum: ["S", "M", "L", "XL"] },
                        validation: { type: "string", description: "Lightweight validation approach." },
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
      },
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "generate_okr_plan" } },
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const txt = await response.text();
      console.error("AI gateway error", response.status, txt);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "No structured output returned" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const args = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(args), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-okr error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
