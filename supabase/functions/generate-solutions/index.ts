import { handleCors, callAITool, errorJson, buildExtraBlock } from "../_shared/ai.ts";

const SYSTEM_PROMPT = `You are a Strategic Hypothesis Coach in the OKR-PI framework.

Given an Objective and ONE Key Result (with baseline/target/metric), generate 3-5 Solutions (strategic bets, NOT features/tasks):
- Each Solution starts with the PROBLEM/JTBD (whose pain it solves)
- Each Solution has a RESULT IMAGE (success state seen from outside)
- Names a LEADING metric expected to move
- Includes confidence (Low/Medium/High), effort (S/M/L/XL) and a lightweight validation approach
- Never use implementation verbs ("build", "launch", "develop", "ship") as the core verb of the bet

КРИТИЧЕСКИ ВАЖНО — ФОРМАТ ПОЛЯ "bet" (гипотеза):
Поле "bet" ВСЕГДА формулируется на русском языке СТРОГО по шаблону:

«Если мы [решим проблему X / закроем задачу пользователя X], то это приведёт к тому, что [описание ключевой опережающей метрики, которая характеризует результат] и повлияет на [KR, на который оказывает влияние], потому что [логика влияния / причинно-следственная связь].»

Требования к формулировке:
- Начинай ровно со слова «Если мы» (с большой буквы, без кавычек внутри bet).
- Используй ЧЕТЫРЕ блока в указанном порядке: «Если мы … , то это приведёт к тому, что … и повлияет на … , потому что … .»
- Все четыре блока должны быть заполнены содержательно — никаких многоточий и плейсхолдеров.
- Соблюдай нормы русского языка: правильные падежи, согласование родов и чисел, корректная пунктуация (запятые перед «то», «и повлияет», «потому что»).
- В блоке «Если мы …» формулируй проблему/JTBD пользователя ГЛАГОЛОМ совершенного вида в форме «решим / закроем / устраним / снимем …», без слов «построим / запустим / разработаем / внедрим».
- В блоке «то это приведёт к тому, что …» — целое придаточное предложение с подлежащим и сказуемым, описывающее изменение опережающей (leading) метрики (например: «доля активаций на 7-й день вырастет», «время до первой ценности сократится»). НЕ используй здесь существительные в дательном падеже после «к тому, что» — только полноценное предложение.
- В блоке «и повлияет на …» — явная ссылка на текущий Key Result (используй его формулировку или краткое имя метрики KR).
- В блоке «потому что …» — короткая логика влияния (механика, поведение пользователя, причинно-следственная связь).
- НЕ используй английские слова и кальки («impact», «drive», «boost»). Только грамотный русский.

ALL text fields (problem, bet, result_image, leading_metric, validation) MUST be written in RUSSIAN. Only enum values stay in English.

Return STRICT JSON only via the provided tool.`;

const PARAMETERS = {
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
};

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { objective, key_result, context, extra_context } = await req.json();
    if (!objective || typeof objective !== "string" || objective.trim().length < 3) {
      return errorJson("Objective is required (min 3 chars)", 400);
    }
    const krText = typeof key_result === "string" ? key_result : key_result?.text;
    if (!krText || krText.trim().length < 3) return errorJson("Key Result is required", 400);

    const krDetails = typeof key_result === "object" && key_result
      ? `KR: ${krText}\nBaseline: ${key_result.baseline ?? "-"}\nTarget: ${key_result.target ?? "-"}\nMetric: ${key_result.metric ?? "-"}\nType: ${key_result.kr_type ?? "-"}`
      : `KR: ${krText}`;

    const extraBlock = buildExtraBlock(
      extra_context,
      "ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ (база знаний, кейсы, методология — используй для генерации):",
    );
    const userPrompt = `OBJECTIVE: ${objective.trim()}\n\n${krDetails}\n\nCONTEXT: ${(context || "").trim() || "(none)"}${extraBlock}\n\nGenerate 3-5 strategic Solutions for this Key Result.`;

    return await callAITool({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      toolName: "generate_solutions",
      toolDescription: "Return generated strategic Solutions for the given KR.",
      parameters: PARAMETERS,
    });
  } catch (e) {
    console.error("generate-solutions error", e);
    return errorJson(e instanceof Error ? e.message : "Unknown error", 500);
  }
});
