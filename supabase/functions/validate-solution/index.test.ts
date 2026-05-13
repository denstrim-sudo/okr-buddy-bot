import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { handler } from "./index.ts";
import { callHandler, RUN_AI } from "../_shared/test_utils.ts";

Deno.test("validate-solution: requires solution object", async () => {
  const { status } = await callHandler(handler, { objective: "x", key_result: "y" });
  assertEquals(status, 400);
});

Deno.test("validate-solution: requires core fields", async () => {
  const { status } = await callHandler(handler, {
    objective: "x",
    key_result: "y",
    solution: { problem: "ok", bet: "", result_image: "ok", leading_metric: "ok" },
  });
  assertEquals(status, 400);
});

Deno.test({
  name: "validate-solution [AI]: returns score, rules, rewritten_solution",
  ignore: !RUN_AI,
  async fn() {
    const { status, data } = await callHandler(handler, {
      objective: "Стать самым любимым онбордингом",
      key_result: "Поднять активацию с 30% до 50%",
      solution: {
        problem: "Новые пользователи не понимают первый шаг и отваливаются на регистрации",
        bet: "Если мы упростим путь до первой ценности, то это приведёт к тому, что доля активаций на 1-й день вырастет и повлияет на KR активации, потому что меньше шагов = меньше отвал.",
        result_image: "Пользователь видит ценность в первые 60 секунд после входа",
        leading_metric: "Доля активаций на 1-й день",
        confidence: "Medium",
        effort: "M",
        validation: "A/B тест на 10% трафика 2 недели",
      },
    });
    assertEquals(status, 200);
    assert(typeof data.score === "number");
    assert(["pass", "warn", "fail"].includes(data.status));
    assert(Array.isArray(data.rules) && data.rules.length >= 5);
    assert(data.rewritten_solution);
  },
});
