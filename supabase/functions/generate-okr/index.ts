import { handleCors, callAITool, errorJson, buildExtraBlock } from "../_shared/ai.ts";

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
   - Names a LEADING metric expected to move
   - Includes confidence (Low/Medium/High), effort (S/M/L/XL), and a lightweight validation approach
   - Never use implementation language ("build", "launch", "develop", "ship") as the core verb

КРИТИЧЕСКИ ВАЖНО — ФОРМАТ ПОЛЯ "bet" в каждом Solution:
Поле "bet" ВСЕГДА формулируется на русском языке СТРОГО по шаблону:

«Если мы [решим проблему X / закроем задачу пользователя X], то это приведёт к [описание ключевой опережающей метрики, которая характеризует результат] и повлияет на [KR, на который оказывает влияние], потому что [логика влияния / причинно-следственная связь].»

Требования:
- Начинай ровно со слова «Если мы».
- Используй ЧЕТЫРЕ блока в указанном порядке: «Если мы … , то это приведёт к … и повлияет на … , потому что … .»
- Все блоки заполнены содержательно, без плейсхолдеров.
- Соблюдай нормы русского языка: падежи, согласование родов/чисел, запятые перед «то», «и повлияет», «потому что».
- В «Если мы …» — глагол совершенного вида («решим / закроем / устраним / снимем …»), без «построим / запустим / разработаем / внедрим».
- В «то это приведёт к …» — опережающая метрика и направление изменения.
- В «и повлияет на …» — явная ссылка на родительский KR (его формулировка или ключевая метрика).
- В «потому что …» — краткая причинно-следственная логика.
- Без английских калек («impact», «drive», «boost»). Только грамотный русский.

IMPORTANT: All generated text content (objective_refined, KR text, baseline, target, metric, problem, bet, result_image, leading_metric, validation) MUST be written in RUSSIAN language. Only the enum values (kr_type, confidence, effort) stay in English as they map to UI codes.

Return STRICT JSON only via the provided tool.`;

const PARAMETERS = {
  type: "object",
  properties: {
    objective_refined: { type: "string", description: "Optionally improved/refined objective phrasing." },
    score: { type: "number", description: "Validation score 0-100 for the resulting OKR quality." },
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
};

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { objective, context, extra_context } = await req.json();
    if (!objective || typeof objective !== "string" || objective.trim().length < 3) {
      return errorJson("Objective is required (min 3 chars)", 400);
    }

    const extraBlock = buildExtraBlock(
      extra_context,
      "ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ (учитывай как авторитетный контекст и методологию):",
    );
    const userPrompt = `OBJECTIVE: ${objective.trim()}\n\nCONTEXT: ${(context || "").trim() || "(none provided)"}${extraBlock}\n\nGenerate 2-4 Key Results and 2-3 Solutions per KR.`;

    return await callAITool({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      toolName: "generate_okr_plan",
      toolDescription: "Return generated Key Results and Solutions for the given Objective.",
      parameters: PARAMETERS,
    });
  } catch (e) {
    console.error("generate-okr error", e);
    return errorJson(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
