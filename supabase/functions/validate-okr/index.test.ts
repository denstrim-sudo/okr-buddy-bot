import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { handler, sanitizeRewrittenObjective } from "./index.ts";
import { callHandler, RUN_AI } from "../_shared/test_utils.ts";
import { containsDigits } from "../_shared/textGuards.ts";

Deno.test("validate-okr: requires objective", async () => {
  const { status } = await callHandler(handler, { objective: "", key_results: ["a"] });
  assertEquals(status, 400);
});

Deno.test("validate-okr: requires at least one KR", async () => {
  const { status } = await callHandler(handler, { objective: "Стать лидером", key_results: [] });
  assertEquals(status, 400);
});

// --- textGuards (продублирован тут на случай, если раннер не подхватывает _shared) ---
Deno.test("containsDigits: 'Удвоить выручку к 2026 году' → true", () => {
  assertEquals(containsDigits("Удвоить выручку к 2026 году"), true);
});
Deno.test("containsDigits: чистый текст → false", () => {
  assertEquals(containsDigits("Стать предсказуемой опорой роста для команды"), false);
});

// --- sanitizeRewrittenObjective: чистая логика, без сети ---

interface TestReport {
  score: number;
  status: "pass" | "warn" | "fail";
  summary: string;
  rules: unknown[];
  rewritten_objective: string;
  rewritten_key_results: string[];
  rewritten_objective_warning?: boolean;
}

const makeReport = (rewritten: string): TestReport => ({
  score: 75,
  status: "pass",
  summary: "ok",
  rules: [],
  rewritten_objective: rewritten,
  rewritten_key_results: ["KR1 без цифр в этой строке"],
});

Deno.test("sanitize: чистый rewritten_objective → redo НЕ вызывается, ответ как есть", async () => {
  const initial = makeReport("Стать предсказуемой опорой роста");
  let redoCalls = 0;
  const result = await sanitizeRewrittenObjective(initial, async () => {
    redoCalls++;
    return makeReport("never used");
  });
  assertEquals(redoCalls, 0);
  assertEquals(result.rewritten_objective, "Стать предсказуемой опорой роста");
  assertEquals(result.rewritten_objective_warning, undefined);
});

Deno.test("sanitize: грязный rewritten_objective → ровно ОДИН redo, чистый результат, без warning", async () => {
  const initial = makeReport("Удвоить выручку к 2026 году");
  let redoCalls = 0;
  const result = await sanitizeRewrittenObjective(initial, async () => {
    redoCalls++;
    return makeReport("Стать опорой роста для команды");
  });
  assertEquals(redoCalls, 1);
  assertEquals(result.rewritten_objective, "Стать опорой роста для команды");
  assertEquals(result.rewritten_objective_warning, undefined);
});

Deno.test("sanitize: после redo цифра осталась → warning=true, ровно один redo (без петли)", async () => {
  const initial = makeReport("Удвоить выручку к 2026 году");
  let redoCalls = 0;
  const result = await sanitizeRewrittenObjective(initial, async () => {
    redoCalls++;
    return makeReport("Достичь 2x роста"); // снова с цифрой
  });
  assertEquals(redoCalls, 1);
  assertEquals(result.rewritten_objective_warning, true);
  // вернули именно второй ответ (с пометкой)
  assert(result.rewritten_objective.includes("2x"));
});

Deno.test("sanitize: если redo бросает — initial помечается warning и возвращается", async () => {
  const initial = makeReport("Удвоить выручку к 2026 году");
  const result = await sanitizeRewrittenObjective(initial, async () => {
    throw new Error("network");
  });
  assertEquals(result.rewritten_objective_warning, true);
  assertEquals(result.rewritten_objective, "Удвоить выручку к 2026 году");
});

Deno.test({
  name: "validate-okr [AI]: returns rules + rewrites with same KR count",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      objective: "Стать самым любимым онбордингом",
      key_results: [
        "Поднять активацию с 30% до 50% к концу года",
        "NPS вырастет с 32 до 50",
      ],
    });
    assertEquals(status, 200);
    assert(typeof data.score === "number");
    assert(Array.isArray(data.rules) && data.rules.length >= 5);
    assertEquals(data.rewritten_key_results.length, 2);
  },
});
