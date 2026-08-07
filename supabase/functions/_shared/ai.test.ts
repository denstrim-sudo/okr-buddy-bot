import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callAITool, shouldFallbackToDefault } from "./ai.ts";

// Подменяем fetch и AIAI_API_KEY, чтобы тест не лез в сеть.
const originalFetch = globalThis.fetch;
const originalKey = Deno.env.get("AIAI_API_KEY");

function toolCallResponse(model: string) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            tool_calls: [
              { function: { name: "test_tool", arguments: JSON.stringify({ ok: true, echoed_model: model }) } },
            ],
          },
        },
      ],
      usage: {},
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function stubOkFetch(_modelEcho: string) {
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    return Promise.resolve(toolCallResponse(body.model));
  }) as typeof fetch;
}

/** Ответ без tool_call → errorCode = no_tool_call. */
function stubNoToolCallFor(badModel: string, calls: string[]) {
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push(body.model);
    if (body.model === badModel) {
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: "просто текст" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(toolCallResponse(body.model));
  }) as typeof fetch;
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

Deno.test("shouldFallbackToDefault: no_tool_call / invalid_json / timeout уводят на gpt-4o", () => {
  for (const code of ["no_tool_call", "invalid_json", "timeout", "aiai_error", "rate_limit"]) {
    assert(
      shouldFallbackToDefault({ ok: false, status: 500, errorCode: code } as never, "gemini-2.5-pro"),
      `${code} должен уводить на fallback`,
    );
  }
  // Для самой gpt-4o fallback не нужен
  assertEquals(
    shouldFallbackToDefault({ ok: false, status: 500, errorCode: "no_tool_call" } as never, "gpt-4o"),
    false,
  );
});

Deno.test("callAITool: no_tool_call на выбранной модели → сразу gpt-4o, без второй попытки в исходную", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  const calls: string[] = [];
  stubNoToolCallFor("gemini-2.5-pro", calls);
  try {
    const res = await callAITool({ ...baseArgs, model: "gemini-2.5-pro" });
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data._meta?.used_model, "gpt-4o");
    assertEquals(data._meta?.requested_model, "gemini-2.5-pro");
    assertEquals(data._meta?.fallback_reason, "no_tool_call");
    // Ровно две попытки: медленная модель один раз, затем gpt-4o.
    assertEquals(calls, ["gemini-2.5-pro", "gpt-4o"]);
  } finally {
    restore();
  }
});

Deno.test("callAITool: таймаут выбранной модели → 504 deadline_exceeded, если fallback тоже не отвечает", async () => {
  Deno.env.set("AIAI_API_KEY", "test-key");
  globalThis.fetch = (() => {
    const err = new Error("timed out");
    err.name = "TimeoutError";
    return Promise.reject(err);
  }) as typeof fetch;
  try {
    const res = await callAITool({ ...baseArgs, model: "gemini-2.5-pro" });
    assertEquals(res.status, 504);
    const data = await res.json();
    assertEquals(data._meta?.used_model, "gpt-4o");
    assert(String(data.error).includes("GPT-4o"));
  } finally {
    restore();
  }
});
