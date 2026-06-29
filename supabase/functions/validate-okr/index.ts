import { handleCors, callAITool, errorJson, buildExtraBlock } from "../_shared/ai.ts";
import { getRulesBlock } from "../_shared/okr_rules.ts";

const buildSystemPrompt = (horizon: string) => `You are an expert OKR Coach auditing an OKR using John Doerr's methodology and the OKR-PI framework.

HORIZON OF THIS OKR: ${horizon}${horizon === "quarter_3m" ? " — применяй КВАРТАЛЬНЫЙ набор правил (с overrides KR10→critical и доп. правилами Q-Focus, Q-Theme, Q-Reach)." : ""}

Given an Objective and a list of Key Results, evaluate them against these RULES (canonical, identical to those used by the drafter):

${getRulesBlock(horizon)}

For EACH rule you MUST return:
- "severity": уровень важности замечания
  - "critical" — без исправления OKR методологически некорректен (Objective с цифрами, KR без метрики, KR-задача вместо outcome, нет baseline/target там, где нужны)
  - "important" — снижает качество и управляемость, но OKR работоспособен (размытая формулировка, отсутствует временной горизонт)
  - "improve" — точечное усиление: стилистика, уточнение сегмента, более конкретная метрика
  - Для pass=true ставь "improve" (или опускай).
- "why": ОДНО короткое предложение на русском (≤140 символов), почему это важно — как это влияет на измеримость, фокус, outcome-ориентированность или управленческий review. БЕЗ методологической лекции. Для pass=true можно оставить пустым.

Пример: { id:"O3", label:"Objective без цифр", pass:false, severity:"critical", hint:"Уберите проценты из Objective", why:"Цифры в Objective подменяют качественную цель и сдвигают фокус на метрику." }

Return STRICT JSON only via the provided tool.

IMPORTANT: All text fields (label, hint, why, summary, suggestion, rewritten_*) MUST be in RUSSIAN. Rule ids and enum values stay English.`;

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
          severity: { type: "string", enum: ["critical", "important", "improve"] },
          why: { type: "string", description: "≤140 chars Russian explanation of why this matters." },
        },
        required: ["id", "label", "pass", "hint", "severity", "why"],
        additionalProperties: false,
      },
    },
    rewritten_objective: { type: "string" },
    rewritten_key_results: { type: "array", items: { type: "string" } },
  },
  required: ["score", "status", "summary", "rules", "rewritten_objective", "rewritten_key_results"],
  additionalProperties: false,
};

export const handler = async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { objective, key_results, key_results_full, extra_context, model } = await req.json();
    if (!objective || typeof objective !== "string" || objective.trim().length < 3) {
      return errorJson("Objective is required (min 3 chars)", 400);
    }
    if (!Array.isArray(key_results) || key_results.length === 0) {
      return errorJson("At least one Key Result is required", 400);
    }

    // Если переданы расширенные KR (с baseline/target/metric/kr_type) — используем их.
    // Иначе — fallback к простому списку строк.
    const enriched = Array.isArray(key_results_full) && key_results_full.length
      ? key_results_full
      : (key_results as string[]).map((t) => ({ text: String(t) }));

    const krList = enriched
      .map((k: any, i: number) => {
        const text = String(k?.text ?? "").trim();
        if (text.length < 4) return "";
        const baseline = k?.baseline ? String(k.baseline).trim() : "";
        const target = k?.target ? String(k.target).trim() : "";
        const metric = k?.metric ? String(k.metric).trim() : "";
        const kr_type = k?.kr_type ? String(k.kr_type).trim() : "";
        const meta: string[] = [];
        if (baseline) meta.push(`baseline: ${baseline}`);
        if (target) meta.push(`target: ${target}`);
        if (metric) meta.push(`metric: ${metric}`);
        if (kr_type) meta.push(`type: ${kr_type}`);
        return `KR${i + 1}: ${text}${meta.length ? `\n  (${meta.join(" · ")})` : ""}`;
      })
      .filter((s) => s.length > 0)
      .join("\n");

    const extraBlock = buildExtraBlock(
      extra_context,
      "ЗАГРУЖЕННЫЕ ДОКУМЕНТЫ (используй как дополнительные правила и контекст при аудите):",
    );
    const userPrompt = `OBJECTIVE: ${objective.trim()}\n\nKEY RESULTS (с метаданными baseline/target/metric/type, если есть — обязательно учитывай их при проверке правил KR2 «from X to Y» и KR1 «измеримость»):\n${krList}${extraBlock}\n\nAudit this OKR and return per-rule findings, an overall score (0-100), a short summary, and rewritten Objective + KRs aligned with Doerr methodology. В переписанных KR сохраняй существующие baseline/target/metric, если они уже корректны.`;

    return await callAITool({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      toolName: "validate_okr",
      toolDescription: "Audit an OKR and return rule-by-rule findings.",
      parameters: PARAMETERS,
      model: typeof model === "string" && model ? model : undefined,
    });
  } catch (e) {
    console.error("validate-okr error", e);
    return errorJson(e instanceof Error ? e.message : "Unknown error", 500);
  }
};

Deno.serve(handler);
