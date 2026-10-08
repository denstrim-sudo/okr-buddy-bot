import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findExecutionVerb, hasDigitsInObjective } from "./textGuards.ts";

Deno.test("hasDigitsInObjective: слова-числительные цифрами не считаются", () => {
  assertEquals(hasDigitsInObjective("Новый клиент становится активным в первый же день"), false);
  assertEquals(hasDigitsInObjective("Один клиент, двух каналов"), false);
  assertEquals(hasDigitsInObjective("Новый клиент активен: 60% новых клиентов с операцией за сутки"), true);
});

Deno.test("findExecutionVerb: инфинитивы где угодно, существительные только в начале", () => {
  assertEquals(findExecutionVerb("Внедрить новую версию ядра АБС до конца года"), "внедрить");
  assertEquals(findExecutionVerb("Запустить новый экран приветствия"), "запустить");
  assertEquals(findExecutionVerb("Доступность входа, переводов и оплат через ЕРИП в пиковые дни остаётся не ниже 99,9%"), null);
  assertEquals(findExecutionVerb("Частота релизов остаётся не ниже текущей"), null);
  assertEquals(findExecutionVerb("70% продуктовых команд на общем конвейере"), null);
  assertEquals(findExecutionVerb("Запуск программы лояльности"), "запуск");
  assertEquals(findExecutionVerb("Скорость запуск продуктов"), null);
  assertEquals(findExecutionVerb("Team will MIGRATE billing"), "migrate");
});
