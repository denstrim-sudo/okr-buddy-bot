import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.105.1/cors";

const SYSTEM_PROMPT = `You are a Strategic Hypothesis Coach in the OKR-PI framework.

Given an Objective and ONE Key Result (with baseline/target/metric), generate 3-5 Solutions (strategic bets, NOT features/tasks):
- Each Solution starts with the PROBLEM/JTBD (whose pain it solves)
- Each Solution has a RESULT IMAGE (success state seen from outside)
- Framed as a hypothesis: "We believe that [bet]... will lead to [result]..."
- Names a LEADING metric expected to move
- Includes confidence (Low/Medium/High), effort (S/M/L/XL) and a lightweight validation approach
- Never use implementation verbs ("build", "launch", "develop", "ship") as the core verb of the bet

IMPORTANT: ALL text fields (problem, bet, result_image, leading_metric, validation) MUST be written in RUSSIAN. Only enum values stay in English.

Return STRICT JSON only via the provided tool.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { objective, key_result, context } = await req.json();
    if (!objective || typeof objective !== "string" || objective.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Objective is required (min 3 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const krText = typeof key_result === "string" ? key_result : key_result?.text;
    if (!krText || krText.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Key Result is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const krDetails = typeof key_result === "object" && key_result
      ? `KR: ${krText}\nBaseline: ${key_result.baseline ?? "-"}\nTarget: ${key_result.target ?? "-"}\nMetric: ${key_result.metric ?? "-"}\nType: ${key_result.kr_type ?? "-"}`
      : `KR: ${krText}`;

    const userPrompt = `OBJECTIVE: ${objective.trim()}\n\n${krDetails}\n\nCONTEXT: ${(context || "").trim() || "(none)"}\n\nGenerate 3-5 strategic Solutions for this Key Result.`;

    const tool = {
      type: "function",
      function: {
        name: "generate_solutions",
        description: "Return generated strategic Solutions for the given KR.",
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
        tool_choice: { type: "function", function: { name: "generate_solutions" } },
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
    console.error("generate-solutions error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
