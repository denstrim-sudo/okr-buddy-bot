import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { handler } from "./index.ts";
import { callHandler, RUN_AI } from "../_shared/test_utils.ts";

Deno.test("generate-solutions: requires objective", async () => {
  const { status } = await callHandler(handler, { objective: "", key_result: "kr text" });
  assertEquals(status, 400);
});

Deno.test("generate-solutions: requires key_result", async () => {
  const { status } = await callHandler(handler, { objective: "Стать лидером", key_result: "" });
  assertEquals(status, 400);
});

Deno.test({
  name: "generate-solutions [AI]: returns 3..5 solutions with required fields",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      objective: "Стать самым любимым онбордингом",
      key_result: "Поднять активацию с 30% до 50% к концу года",
    });
    assertEquals(status, 200);
    assert(Array.isArray(data.solutions));
    assert(data.solutions.length >= 3 && data.solutions.length <= 5);
    for (const s of data.solutions) {
      for (const f of ["problem", "bet", "result_image", "leading_metric", "validation"]) {
        assert(typeof s[f] === "string" && s[f].length > 0, `field ${f} missing`);
      }
      assert(["Low", "Medium", "High"].includes(s.confidence));
      assert(["S", "M", "L", "XL"].includes(s.effort));
    }
  },
});

// --- анти-тавтологический эталон в системном промпте ---
import { SYSTEM_PROMPT } from "./index.ts";

Deno.test("generate-solutions: SYSTEM_PROMPT содержит анти-тавтологический эталон", () => {
  assert(SYSTEM_PROMPT.includes("ЭТАЛОН ГИПОТЕЗЫ"), "должен быть блок ЭТАЛОН ГИПОТЕЗЫ");
  assert(/ПЛОХО.*тавтолог/i.test(SYSTEM_PROMPT), "должен быть маркер ПЛОХО с тавтологией");
  assert(SYSTEM_PROMPT.includes("ОТЛИЧНО"), "должен быть маркер ОТЛИЧНО");
  assert(/потому что.*(механизм|переформулировк)/i.test(SYSTEM_PROMPT),
    "должен быть тест на 'потому что = механизм ≠ переформулировка следствия'");
});

// --- grep-guard: старые id правил не встречаются в SYSTEM_PROMPT ---
Deno.test("generate-solutions SYSTEM_PROMPT: старые id правил (O1..O3, KR1..KR4, KR10) отсутствуют", () => {
  const oldO = /\bO[0-9]\b/;
  const oldKR = /\bKR(1|2|3|4|10)\b/;
  assertEquals(oldO.test(SYSTEM_PROMPT), false, "old O-id найден в SYSTEM_PROMPT");
  assertEquals(oldKR.test(SYSTEM_PROMPT), false, "old KR-id найден в SYSTEM_PROMPT");
});
