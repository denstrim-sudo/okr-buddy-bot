import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSystemPrompt, buildParameters, handler } from "./index.ts";
import { callHandler } from "../_shared/test_utils.ts";

// --- mock AI transport ---
const realFetch = globalThis.fetch;
function _restoreFetch() {
  globalThis.fetch = realFetch;
}
function queueAiResponses(payloads: unknown[]) {
  let i = 0;
  globalThis.fetch = ((_url: string | URL | Request, _init?: RequestInit) => {
    const payload = payloads[Math.min(i++, payloads.length - 1)];
    return Promise.resolve(
      new Response(
        JSON.stringify({
          model: "gpt-4o",
          choices: [
            {
              message: {
                tool_calls: [
                  { function: { name: "analyze_pyramid_link", arguments: JSON.stringify(payload) } },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  }) as typeof fetch;
}

const solution = {
  id: "s1",
  title: "Автоматическая маршрутизация заявок",
  description: "Если мы автоматизируем маршрутизацию заявок, то это приведёт к тому, что сократится время ответа",
};

const metricsCatalog = [
  { id: "m1", name: "Время ответа на заявку" },
  { id: "m2", name: "Индекс доверия клиентов (NPS)" },
];

const okrNodes = [
  {
    okrId: "dir",
    level: "direction",
    objective: "Сделать обслуживание быстрым",
    key_results: ["Доля фродовых операций, выявленных антифрод-системой, выросла с 17,3% до 40%"],
  },
  { okrId: "bank", level: "bank", objective: "Стать опорой роста", key_results: ["KR банка"] },
];

const chains = [
  {
    metricId: "m1",
    metricName: "Время ответа на заявку",
    status: "broken_at_direction",
    path: [],
    brokenAt: { okrId: "dir", krIndex: 0, krText: okrNodes[0].key_results[0] },
  },
];

const baseBody = {
  solution,
  chains,
  okr_nodes: okrNodes,
  metrics: metricsCatalog,
  kr_metrics: { "dir:0": "m2" },
};

Deno.test("buildSystemPrompt содержит инструкции по трём задачам", () => {
  const p = buildSystemPrompt();
  assert(p.includes("ДОСТРОЙКА ОБРЫВА"), "нет задачи достройки обрыва");
  assert(p.includes("ОСМЫСЛЕННОСТЬ СВЯЗИ РЕШЕНИЕ"), "нет задачи осмысленности связи");
  assert(p.includes("СООТВЕТСТВИЕ KR"), "нет задачи соответствия KR↔метрика");
  assert(p.includes("evidence"), "нет требования цитаты");
  assert(p.includes("НЕ выдумывай"), "нет запрета на выдумывание");
});

Deno.test("схема требует evidence для каждой рекомендации", () => {
  const p = buildParameters();
  const item = p.properties.recommendations.items;
  assert(item.required.includes("evidence"), JSON.stringify(item.required));
  assert(item.required.includes("type"));
  assert(item.required.includes("text"));
  assertEquals(item.properties.type.enum, ["bridge_gap", "weak_link", "metric_mismatch"]);
});

Deno.test("handler вычисляет grounded серверно через isGrounded", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  queueAiResponses([
    {
      summary: "итог",
      recommendations: [
        {
          type: "weak_link",
          text: "Механизм влияния неочевиден",
          evidence: "Автоматическая маршрутизация заявок",
          grounded: false, // самооценка модели игнорируется
        },
      ],
    },
  ]);
  try {
    const { status, data } = await callHandler(handler, baseBody);
    assertEquals(status, 200);
    assertEquals(data.recommendations[0].grounded, true);
  } finally {
    _restoreFetch();
  }
});

Deno.test("рекомендация с grounded=false возвращается с пометкой, но не отбрасывается", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  queueAiResponses([
    {
      summary: "итог",
      recommendations: [
        { type: "metric_mismatch", text: "Метрика измеряет другое", evidence: "выдуманная цитата zzz" },
        { type: "bridge_gap", text: "Свяжи вверх", evidence: "KR банка" },
      ],
    },
  ]);
  try {
    const { data } = await callHandler(handler, baseBody);
    assertEquals(data.recommendations.length, 2);
    assertEquals(data.recommendations[0].grounded, false);
    assertEquals(data.recommendations[1].grounded, true);
  } finally {
    _restoreFetch();
  }
});

Deno.test("target_* валидируются против контекста, выдуманные обнуляются", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  queueAiResponses([
    {
      summary: "итог",
      recommendations: [
        {
          type: "bridge_gap",
          text: "Связать с KR банка",
          evidence: "KR банка",
          target_metric_id: "m2",
          target_okr_id: "bank",
          target_kr_index: 0,
        },
        {
          type: "bridge_gap",
          text: "Связать с выдуманным",
          evidence: "KR банка",
          target_metric_id: "m999",
          target_okr_id: "ghost",
          target_kr_index: 7,
        },
      ],
    },
  ]);
  try {
    const { data } = await callHandler(handler, baseBody);
    const [ok, bad] = data.recommendations;
    assertEquals(ok.target_metric_id, "m2");
    assertEquals(ok.target_okr_id, "bank");
    assertEquals(ok.target_kr_index, 0);
    assertEquals(bad.target_metric_id, null);
    assertEquals(bad.target_okr_id, null);
    assertEquals(bad.target_kr_index, null);
  } finally {
    _restoreFetch();
  }
});
