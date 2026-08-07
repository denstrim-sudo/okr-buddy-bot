import { handleCors, callAITool, errorJson, json, buildExtraBlock } from "../_shared/ai.ts";
import { isEvidenceGrounded } from "../_shared/textGuards.ts";

export const buildSystemPrompt = () => `Ты — коуч по связанности стратегии. Ты проверяешь, действительно ли работа (Решение) связана со стратегией через метрики и Key Results.

ЧЕТЫРЕ ЗАДАЧИ:

1. ДОСТРОЙКА ОБРЫВА (type = "bridge_gap"): где цепочка оборвалась — предложи конкретно, что связать: какой KR верхнего уровня напрашивается по смыслу, какая метрика могла бы стать мостом. Только из переданного контекста, не выдумывай.

2. ОСМЫСЛЕННОСТЬ СВЯЗИ РЕШЕНИЕ→МЕТРИКА (type = "weak_link"): связь может существовать формально, но быть натянутой. Если механизм влияния Решения на метрику неочевиден — скажи прямо и попроси обосновать механизм. Это главная патология: «мы это делаем ради стратегии» без реального механизма влияния.

3. СООТВЕТСТВИЕ KR↔МЕТРИКА (type = "metric_mismatch"): измеряет ли привязанная метрика то же, что заявлено в тексте KR. Пример патологии: KR «Доля фродовых операций, выявленных антифрод-системой, выросла с 17,3% до 40%» привязан к метрике «Индекс доверия клиентов (NPS)» — формально связь есть, по смыслу метрика измеряет другое (выявление фрода ≠ доверие клиентов). Такое несоответствие делает всю цепочку вверх недостоверной.

4. ОСМЫСЛЕННОСТЬ ВЛИЯНИЯ МЕТРИКА→МЕТРИКА (type = "metric_influence_weak"): связь между метриками — это утверждение о причинности: «сдвиг метрики А приведёт к сдвигу метрики Б». Проверь, правдоподобен ли механизм. Если А и Б измеряют разные явления без понятной причинной связи — скажи прямо и попроси обосновать механизм. Пример осмысленной связи: «Конверсия в отказ на опросе безопасности» → «Доля превентивно предотвращённых фрод-операций» (отказ клиента на опросе напрямую предотвращает операцию). Пример натянутой: «Скорость загрузки приложения» → «Доля выявленного фрода» (связь не невозможна, но механизм не очевиден и требует обоснования). Как и в остальных задачах — ОБЯЗАТЕЛЬНА дословная цитата (названия обеих метрик). Для таких выводов указывай target_from_metric_id и target_to_metric_id.

ОБЯЗАТЕЛЬНО: для КАЖДОГО вывода приведи evidence — дословную цитату из текста Решения, названия метрики или текста KR (≤120 символов, буквальная подстрока, без перефразирования). Если процитировать нечего — значит основания для сомнения нет, не выдумывай вывод.

НЕ выдумывай метрики и KR, которых нет в переданном контексте. target_metric_id, target_okr_id и target_kr_index указывай только из переданных данных.

Все тексты — на русском. Отвечай строго через предоставленный инструмент.`;

export function buildParameters() {
  return {
    type: "object",
    properties: {
      summary: { type: "string", description: "1-2 предложения по-русски: насколько работа связана со стратегией." },
      recommendations: {
        type: "array",
        minItems: 0,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["bridge_gap", "weak_link", "metric_mismatch", "metric_influence_weak"] },
            text: { type: "string", description: "Рекомендация на русском, 1-3 предложения." },
            evidence: { type: "string", description: "Дословная цитата из текста Решения, названия метрики или текста KR." },
            target_metric_id: { type: "string", description: "id метрики из переданного справочника или пустая строка." },
            target_okr_id: { type: "string", description: "okrId из переданного контекста или пустая строка." },
            target_kr_index: { type: "number", description: "0-based индекс KR в этом OKR; -1 если не применимо." },
            target_from_metric_id: { type: "string", description: "id опережающей метрики из переданных связей метрика→метрика, или пустая строка." },
            target_to_metric_id: { type: "string", description: "id метрики выше из переданных связей метрика→метрика, или пустая строка." },
          },
          required: ["type", "text", "evidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["summary", "recommendations"],
    additionalProperties: false,
  };
}

interface OkrNode {
  okrId: string;
  level?: string;
  objective: string;
  key_results: string[];
}

const CHAIN_LABELS: Record<string, string> = {
  complete: "цепочка связная",
  broken_at_direction: "ОБРЫВ на уровне направления",
  orphan_metric: "метрика ни к одному KR не привязана",
  no_metrics: "у Решения нет привязанных метрик",
};

export const handler = async (req: Request): Promise<Response> => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json();
    const solution = body?.solution ?? {};
    const chains: any[] = Array.isArray(body?.chains) ? body.chains : [];
    const okrNodes: OkrNode[] = Array.isArray(body?.okr_nodes) ? body.okr_nodes : [];
    const metrics: Array<{ id: string; name: string; unit?: string }> = Array.isArray(body?.metrics)
      ? body.metrics
      : [];
    const krMetrics: Record<string, string> = body?.kr_metrics ?? {};
    const metricInfluences: Array<{ from: string; to: string }> = Array.isArray(body?.metric_influences)
      ? body.metric_influences.filter((e: any) => e && typeof e.from === "string" && typeof e.to === "string")
      : [];

    const solutionText = [solution?.title, solution?.description].filter(Boolean).join(". ").trim();
    if (solutionText.length < 3) return errorJson("Пустое Решение", 400);

    const metricName = (id: string) => metrics.find((m) => m.id === id)?.name ?? id;

    const okrBlock = okrNodes
      .map(
        (n) =>
          `- [${n.okrId}] уровень=${n.level ?? "?"} · Objective: ${n.objective}\n` +
          (n.key_results ?? [])
            .map((kr, i) => {
              const linked = krMetrics[`${n.okrId}:${i}`];
              return `    KR${i + 1} (index=${i}): ${kr}${linked ? ` · привязанная метрика: ${metricName(linked)} [${linked}]` : " · метрика не привязана"}`;
            })
            .join("\n"),
      )
      .join("\n");

    const chainsBlock = chains
      .map(
        (c) =>
          `- метрика «${c.metricName || metricName(c.metricId)}» [${c.metricId || "—"}]: ${CHAIN_LABELS[c.status] ?? c.status}` +
          (c.brokenAt ? ` · обрыв на KR${(c.brokenAt.krIndex ?? 0) + 1} «${c.brokenAt.krText}» (okrId=${c.brokenAt.okrId})` : "") +
          ((c.path ?? []).length
            ? `\n    путь: ${(c.path as any[]).map((p) => `${p.level}/${p.okrId}/KR${p.krIndex + 1}: ${p.krText}`).join(" → ")}`
            : ""),
      )
      .join("\n");

    const userPrompt = `РЕШЕНИЕ (из модуля «Решения»):
Название: ${solution?.title ?? ""}
Описание: ${solution?.description ?? ""}

МЕТРИКИ, ПРИВЯЗАННЫЕ К РЕШЕНИЮ, И ИХ ЦЕПОЧКИ ВВЕРХ:
${chainsBlock || "— нет"}

КОНТЕКСТ OKR (только из этого списка можно предлагать связи):
${okrBlock || "— нет"}

СВЯЗИ МЕТРИКА→МЕТРИКА, УЧАСТВУЮЩИЕ В ЭТИХ ЦЕПОЧКАХ (только их и оценивай):
${metricInfluences.map((e) => `- «${metricName(e.from)}» [${e.from}] → «${metricName(e.to)}» [${e.to}]`).join("\n") || "— нет"}

СПРАВОЧНИК МЕТРИК:
${metrics.map((m) => `- ${m.name} [${m.id}]${m.unit ? `, ${m.unit}` : ""}`).join("\n") || "— пусто"}${buildExtraBlock(body?.extra_context, "ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ:")}`;

    const res = await callAITool({
      systemPrompt: buildSystemPrompt(),
      userPrompt,
      toolName: "analyze_pyramid_link",
      toolDescription: "Проверить связанность Решения со стратегией через метрики и KR.",
      parameters: buildParameters(),
      model: typeof body?.model === "string" ? body.model : undefined,
    });
    if (res.status !== 200) return res;
    const data: any = await res.json();

    const modelUsed = typeof data.__model_used === "string" ? data.__model_used : undefined;
    delete data.__model_used;
    if (modelUsed) data.model_used = modelUsed;

    // Серверная проверка обоснованности + валидация target_* против контекста.
    const krTexts = okrNodes.flatMap((n) => n.key_results ?? []);
    const sources = [solutionText, ...metrics.map((m) => m.name), ...krTexts, ...okrNodes.map((n) => n.objective)];
    const metricIds = new Set(metrics.map((m) => m.id));
    const nodeById = new Map(okrNodes.map((n) => [n.okrId, n]));

    const influenceFrom = new Set(metricInfluences.map((e) => e.from));
    const influenceTo = new Set(metricInfluences.map((e) => e.to));

    if (Array.isArray(data.recommendations)) {
      data.recommendations = data.recommendations.map((r: any) => {
        const targetOkrId = r?.target_okr_id && nodeById.has(r.target_okr_id) ? r.target_okr_id : null;
        const node = targetOkrId ? nodeById.get(targetOkrId) : undefined;
        const idx = typeof r?.target_kr_index === "number" ? r.target_kr_index : -1;
        const targetKrIndex =
          node && idx >= 0 && idx < (node.key_results ?? []).length ? idx : null;
        return {
          ...r,
          grounded: isEvidenceGrounded(r?.evidence, sources),
          target_metric_id: r?.target_metric_id && metricIds.has(r.target_metric_id) ? r.target_metric_id : null,
          target_okr_id: targetOkrId,
          target_kr_index: targetKrIndex,
          target_from_metric_id:
            r?.target_from_metric_id && influenceFrom.has(r.target_from_metric_id)
              ? r.target_from_metric_id
              : null,
          target_to_metric_id:
            r?.target_to_metric_id && influenceTo.has(r.target_to_metric_id)
              ? r.target_to_metric_id
              : null,
        };
      });
    } else {
      data.recommendations = [];
    }

    return json(data);
  } catch (e) {
    console.error("analyze-pyramid-link error", e);
    return errorJson(e instanceof Error ? e.message : "Unknown error", 500);
  }
};

Deno.serve(handler);
