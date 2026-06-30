import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { OKR_RULES_BLOCK, OKR_RULES_BLOCK_QUARTER } from "./okr_rules.ts";
import { containsDigits } from "./textGuards.ts";

// --- O2 wording (snapshot guard against the old "ограничен по времени" formulation
//     that conflicted with O3 "без цифр" and forced score<=60). ---

Deno.test("BASE_RULES (via OKR_RULES_BLOCK): O2 не требует явного срока/даты в тексте Objective", () => {
  // Старая формулировка содержала ровно эту пару слов в одном правиле:
  // "Objective амбициозный, ограниченный по времени, запоминающийся."
  // Новая редакция её устраняет.
  const o2Line = OKR_RULES_BLOCK.split("\n").find((l) => l.trim().startsWith("- O2")) ?? "";
  assert(o2Line.length > 0, "Строка O2 должна присутствовать в правилах");
  assert(
    !/ограничен[а-я]*\s+(по\s+)?времени/i.test(o2Line),
    `O2 не должна требовать "ограниченности по времени" — это конфликтует с O3 (без цифр). Получили: ${o2Line}`,
  );
  assert(
    o2Line.includes("соответствует выбранному горизонту"),
    `O2 должна ссылаться на выбранный горизонт. Получили: ${o2Line}`,
  );
});

Deno.test("BASE_RULES: O2 явно говорит, что цифра/дата в Objective НЕ требуется", () => {
  const o2Line = OKR_RULES_BLOCK.split("\n").find((l) => l.trim().startsWith("- O2")) ?? "";
  assert(
    /НЕ\s+требует\s+явного\s+срока/i.test(o2Line),
    `O2 должна явно снимать требование срока/даты. Получили: ${o2Line}`,
  );
});

Deno.test("OKR_RULES_BLOCK_QUARTER унаследовал НОВУЮ редакцию O2 (без 'ограничен по времени')", () => {
  // BASE_RULES общий — это регрессионный тест, что квартальный блок не пришёл
  // откуда-то ещё со старой формулировкой.
  assert(
    OKR_RULES_BLOCK_QUARTER.includes("соответствует выбранному горизонту"),
    "Квартальный блок должен содержать обновлённую формулировку O2",
  );
  const o2Line = OKR_RULES_BLOCK_QUARTER
    .split("\n")
    .find((l) => l.trim().startsWith("- O2")) ?? "";
  assert(
    !/ограничен[а-я]*\s+(по\s+)?времени/i.test(o2Line),
    `O2 в квартальном блоке не должна требовать срока. Получили: ${o2Line}`,
  );
});

// --- textGuards smoke (полный модульный тест на containsDigits лежит здесь,
//     чтобы оба shared-модуля проходили в одном раннере). ---

Deno.test("containsDigits: распознаёт год в тексте Objective", () => {
  assert(containsDigits("Удвоить выручку к 2026 году") === true);
});

Deno.test("containsDigits: чистый текст без цифр → false", () => {
  assert(containsDigits("Стать предсказуемой опорой роста для команды") === false);
});
