import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callAITool } from "./ai.ts";

// Подменяем fetch и AIAI_API_KEY, чтобы тест не лез в сеть.
const originalFetch = globalThis.fetch;
const originalKey = Deno.env.get("AIAI_API_KEY");

function stubOkFetch(modelEcho: string) {
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    // Возвращаем минимально-валидный openai-совместимый ответ с tool_call.
    const payload = {
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: "test_tool",
                  arguments: JSON.stringify({ ok: true, echoed_model: body.model }),
                },
              },
            ],
          },
        },
      ],
      usage: {},
    };
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;
  void modelEcho;
}

function restore() {
  globalThis.fetch = originalFetch;
  if (originalKey !== undefined) Deno.env.set("AIAI_API_KEY", originalKey);
}

const baseArgs = {
  systemPrompt: "sys",
  userPrompt: "usr",
  toolName: "test_tool",
  toolDescription: "test",
  parameters: { type: "object", properties: {}, additionalProperties: true },
};

Deno.test("callAITool: возвращает __model_used = реально вызванная модель (без fallback)", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  stubOkFetch("claude-haiku-4.5");
  try {
    const res = await callAITool({ ...baseArgs, model: "claude-haiku-4.5" });
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.__model_used, "claude-haiku-4.5");
    // _meta также присутствует и согласован
    assertEquals(data._meta?.used_model, "claude-haiku-4.5");
    assert(data.ok === true);
  } finally {
    restore();
  }
});

Deno.test("callAITool: без model → __model_used = DEFAULT_MODEL (gpt-4o)", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  stubOkFetch("gpt-4o");
  try {
    const res = await callAITool({ ...baseArgs });
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.__model_used, "gpt-4o");
  } finally {
    restore();
  }
});
