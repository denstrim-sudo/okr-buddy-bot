import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  OKR_RULES_BLOCK, OKR_RULES_BLOCK_QUARTER, getFewShotBlock, getRulesBlock, krCountRange, requiredAngles,
} from "./okr_rules.ts";
import { containsDigits } from "./textGuards.ts";

const ALL_CTX = [
  { horizon: "block_12m" },
  { horizon: "quarter_3m", okr_type: "committed" as const },
  { horizon: "strategic_3y", okr_type: "aspirational" as const, okr_status: "direction" as const },
  { horizon: "block_12m", okr_type: "mixed" as const },
];

// --- requiredAngles / krCountRange (OKR-PI 3.3) ---

Deno.test("requiredAngles по типу OKR (OKR-PI 3.3)", () => {
  assertEquals(requiredAngles("aspirational"), ["К", "У"]);
  assertEquals(requiredAngles("committed"), ["К", "О"]);
  assertEquals(requiredAngles("mixed"), { must: ["К"], oneOf: ["О", "У"] });
  assertEquals(requiredAngles(undefined), null);
});

Deno.test("krCountRange: направление 2..4, обычный OKR 3..5", () => {
  assertEquals(krCountRange("direction"), [2, 4]);
  assertEquals(krCountRange("regular"), [3, 5]);
  assertEquals(krCountRange(undefined), [3, 5]);
});

// --- getRulesBlock(ctx) ---

Deno.test("getRulesBlock: KR-MEASURABLE принимает формы удержания порога и форму обучения", () => {
  const b = getRulesBlock({ horizon: "block_12m" });
  for (const s of ["с X до Y", "с Y до X", "остаётся выше X", "остаётся ниже Y", "к [дата] известно"]) {
    assert(b.includes(s), `нет формы «${s}»`);
  }
});

Deno.test("getRulesBlock: KR-OUTCOME перечисляет запрещённые глаголы (рус + англ)", () => {
  const b = getRulesBlock("block_12m");
  for (const v of ["запустить", "внедрить", "перевести", "построить", "launch", "implement", "migrate", "build"]) {
    assert(b.includes(v), `нет глагола ${v}`);
  }
});

Deno.test("getRulesBlock: KR-LEARNING-FORM, KR-QUALITY-PAIR, ракурсы, Objective без способа", () => {
  const b = getRulesBlock({ horizon: "block_12m", okr_type: "mixed" });
  assert(b.includes("формальный [У]"));
  assert(b.includes("ложные блокировки с 2% до 0,8%"));
  assert(b.includes("[К] клиент и бизнес") && b.includes("[О] осуществимость и риски") && b.includes("[У] обучение"));
  assert(b.includes("через внедрение X"));
  assert(b.includes("контрольными точками внутри года"));
});

// Переписано: раньше проверяли KR-BASELINE-TARGET, Q-FOCUS, Q-THEME и KR-PERSPECTIVES.
// По OKR-PI (3.3, 3.4) они заменены на KR-MEASURABLE (формы), KR-REQUIRED-ANGLES и KR-COUNT.
Deno.test("getRulesBlock не содержит KR-BASELINE-TARGET, Q-THEME, Q-FOCUS, KR-PERSPECTIVES (OKR-PI 3.3/3.4)", () => {
  for (const ctx of ALL_CTX) {
    const b = getRulesBlock(ctx);
    for (const dead of ["KR-BASELINE-TARGET", "Q-THEME", "Q-FOCUS", "KR-PERSPECTIVES"]) {
      assert(!b.includes(dead), `${dead} не должно быть в блоке ${JSON.stringify(ctx)}`);
    }
  }
});

Deno.test("getRulesBlock: OBJ-AMBITIOUS только для aspirational/mixed, Q-REACH только для квартала", () => {
  assert(!getRulesBlock({ horizon: "block_12m", okr_type: "committed" }).includes("OBJ-AMBITIOUS"));
  assert(getRulesBlock({ horizon: "block_12m", okr_type: "aspirational" }).includes("- OBJ-AMBITIOUS"));
  assert(getRulesBlock("quarter_3m").includes("- Q-REACH"));
  assert(!getRulesBlock("block_12m").includes("Q-REACH"));
});

Deno.test("getRulesBlock: OBJ-AMBITIOUS не требует явного срока в тексте Objective", () => {
  const line = getRulesBlock({ okr_type: "aspirational" }).split("\n").find((l) => l.startsWith("- OBJ-AMBITIOUS")) ?? "";
  assert(/НЕ требует явного срока/.test(line), line);
  assert(line.includes("соответствует выбранному горизонту"));
});

Deno.test("getRulesBlock: severity KR-LEADING и KR-REQUIRED-ANGLES в тексте зависят от контекста", () => {
  assert(getRulesBlock("quarter_3m").includes("- KR-LEADING [critical]"));
  assert(getRulesBlock("block_12m").includes("- KR-LEADING [important]"));
  assert(getRulesBlock({ okr_status: "direction", okr_type: "aspirational" }).includes("- KR-REQUIRED-ANGLES [critical]"));
});

// Переписано (О1–О17): «СТАТУС» заменён на «ПРОИСХОЖДЕНИЕ»; для направления тип принудительно амбициозный.
Deno.test("getRulesBlock: строки типа и происхождения OKR", () => {
  const b = getRulesBlock({ okr_type: "committed", okr_status: "direction" });
  assert(b.includes("ТИП OKR: амбициозный") && b.includes("ПРОИСХОЖДЕНИЕ: из направления роста"));
  assert(getRulesBlock({ okr_origin: "protection_direction" }).includes("ПРОИСХОЖДЕНИЕ: из защитного направления"));
  assert(getRulesBlock({ okr_type: "committed" }).includes("ТИП OKR: обязательный. ПРОИСХОЖДЕНИЕ: обычный OKR"));
});

Deno.test("Блоки правил содержат сноску про разведение id-правил и номеров KR", () => {
  assert(/НЕ номера ключевых результатов пользователя/.test(OKR_RULES_BLOCK));
  assert(/НЕ номера ключевых результатов пользователя/.test(OKR_RULES_BLOCK_QUARTER));
});

Deno.test("Блоки правил не используют старые id (O1..O3, KR1..KR4, KR10) как токены", () => {
  for (const dead of ["O1", "O2", "O3", "KR1", "KR2", "KR3", "KR4", "KR10"]) {
    const p = new RegExp(`-\\s+${dead}\\s+\\[`);
    assert(!p.test(OKR_RULES_BLOCK) && !p.test(OKR_RULES_BLOCK_QUARTER), dead);
  }
});

Deno.test("Слово «драйвер» не используется в правилах и эталонах", () => {
  for (const ctx of ALL_CTX) {
    assert(!/драйвер/i.test(getRulesBlock(ctx)));
    assert(!/драйвер/i.test(getFewShotBlock(ctx)));
  }
});

// --- textGuards smoke ---

Deno.test("containsDigits: распознаёт год в тексте Objective", () => {
  assert(containsDigits("Удвоить выручку к 2026 году") === true);
});
Deno.test("containsDigits: чистый текст без цифр → false", () => {
  assert(containsDigits("Стать предсказуемой опорой роста для команды") === false);
});

// --- эталоны банка по типу OKR ---

Deno.test("getFewShotBlock: эталон по типу OKR, с метками ракурсов и строкой «на разборе»", () => {
  const cases: Array<[string | undefined, string]> = [
    ["aspirational", "Кредит в один клик"],
    ["committed", "Надёжность в пиковые дни"],
    ["mixed", "Антифрод без лишнего трения"],
  ];
  for (const [t, title] of cases) {
    const b = getFewShotBlock({ horizon: "block_12m", okr_type: t as never });
    assert(b.includes(title), `${t}: ожидали эталон «${title}»`);
    assert(b.includes("[К]"), `${t}: нужна метка [К]`);
    assert(/На разборе/.test(b), `${t}: нужна строка «на разборе»`);
  }
});

Deno.test("getFewShotBlock: отрицательный пример про активацию действующих клиентов и тесты KR-OUTCOME/KR-LEADING", () => {
  const b = getFewShotBlock("quarter_3m");
  assert(b.includes("Активация действующих клиентов другими продуктами и сервисами"));
  assert(b.includes("KR-OUTCOME") && b.includes("KR-LEADING"));
  assert(!/\bKR3\b|\bKR10\b/.test(b));
});

// OKR-PI 6.1: эталон «Кредит в один клик» взят из методологии банка.
Deno.test("getFewShotBlock(aspirational): эталон OKR-PI 6.1", () => {
  const b = getFewShotBlock({ okr_type: "aspirational" });
  assert(b.includes("быстрее, чем успевает передумать"));
  assert(b.includes("Просрочка 30+"));
});
