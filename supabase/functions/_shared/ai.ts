import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.105.1/cors";

export { corsHeaders };

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const errorJson = (msg: string, status = 500) => json({ error: msg }, status);

export const buildExtraBlock = (extra_context: unknown, label: string) =>
  typeof extra_context === "string" && extra_context.trim().length > 20
    ? `\n\n${label}\n${extra_context.trim().slice(0, 12000)}`
    : "";

interface CallArgs {
  systemPrompt: string;
  userPrompt: string;
  toolName: string;
  toolDescription: string;
  parameters: Record<string, unknown>;
  model?: string;
}

export async function callAITool({
  systemPrompt,
  userPrompt,
  toolName,
  toolDescription,
  parameters,
  model = "google/gemini-3-flash-preview",
}: CallArgs): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return errorJson("LOVABLE_API_KEY is not configured", 500);

  const tool = {
    type: "function",
    function: { name: toolName, description: toolDescription, parameters },
  };

  let response: Response;
  try {
    response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: toolName } },
      }),
    });
  } catch (e) {
    console.error("AI gateway fetch failed", e);
    return errorJson("AI gateway unreachable", 502);
  }

  if (response.status === 429) return errorJson("Rate limit exceeded. Please try again shortly.", 429);
  if (response.status === 402) return errorJson("AI credits exhausted. Add credits in Settings → Workspace → Usage.", 402);
  if (!response.ok) {
    console.error("AI gateway error", response.status, await response.text());
    return errorJson("AI gateway error", 500);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return errorJson("No structured output returned", 500);

  try {
    return json(JSON.parse(toolCall.function.arguments));
  } catch {
    return errorJson("Failed to parse AI output", 500);
  }
}

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}
