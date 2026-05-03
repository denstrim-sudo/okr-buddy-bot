import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.105.1/cors";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { objective, key_results, extra_context } = await req.json();
    if (!objective || typeof objective !== "string" || objective.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Objective is required (min 3 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(key_results) || key_results.length === 0) {
      return new Response(JSON.stringify({ error: "At least one Key Result is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const krList = (key_results as string[])
      .map((k, i) => `KR${i + 1}: ${String(k).trim()}`)
      .filter((s) => s.length > 4)
      .join("\n");

    const extraBlock = typeof extra_context === "string" && extra_context.trim().length > 20
      ? `\n\nЗАГРУЖЕННЫЕ ДОКУМЕНТЫ (используй как дополнительные правила и контекст при аудите):\n${extra_context.trim().slice(0, 12000)}`
      : "";

    const userPrompt = `OBJECTIVE: ${objective.trim()}\n\nKEY RESULTS:\n${krList}${extraBlock}\n\nAudit this OKR and return per-rule findings, an overall score (0-100), a short summary, and rewritten Objective + KRs aligned with Doerr methodology.`;

    const tool = {
      type: "function",
      function: {
        name: "validate_okr",
        description: "Audit an OKR and return rule-by-rule findings.",
        parameters: {
          type: "object",
          properties: {
            score: { type: "number", description: "0-100 overall validation score" },
            status: { type: "string", enum: ["pass", "warn", "fail"] },
            summary: { type: "string", description: "Short overall verdict in Russian." },
            rules: {
              type: "array",
              minItems: 5,
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
        tool_choice: { type: "function", function: { name: "validate_okr" } },
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
    console.error("validate-okr error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
