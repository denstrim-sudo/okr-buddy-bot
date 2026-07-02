import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { OKR_RULES_BLOCK, OKR_RULES_BLOCK_QUARTER, getFewShotBlock } from "./okr_rules.ts";
import { containsDigits } from "./textGuards.ts";

// --- OBJ-AMBITIOUS wording (snapshot guard against the old "ограничен по времени"
//     formulation that conflicted with OBJ-NO-NUMBERS and forced score<=60). ---

Deno.test("BASE_RULES: OBJ-AMBITIOUS не требует явного срока/даты в тексте Objective", () => {
  const line = OKR_RULES_BLOCK.split("\n").find((l) => l.trim().startsWith("- OBJ-AMBITIOUS")) ?? "";
  assert(line.length > 0, "Строка OBJ-AMBITIOUS должна присутствовать в правилах");
  assert(
    !/ограничен[а-я]*\s+(по\s+)?времени/i.test(line),
    `OBJ-AMBITIOUS не должна требовать "ограниченности по времени" — конфликтует с OBJ-NO-NUMBERS. Получили: ${line}`,
  );
  assert(
    line.includes("соответствует выбранному горизонту"),
    `OBJ-AMBITIOUS должна ссылаться на выбранный горизонт. Получили: ${line}`,
  );
});

Deno.test("BASE_RULES: OBJ-AMBITIOUS явно говорит, что цифра/дата в Objective НЕ требуется", () => {
  const line = OKR_RULES_BLOCK.split("\n").find((l) => l.trim().startsWith("- OBJ-AMBITIOUS")) ?? "";
  assert(
    /НЕ\s+требует\s+явного\s+срока/i.test(line),
    `OBJ-AMBITIOUS должна явно снимать требование срока/даты. Получили: ${line}`,
  );
});

Deno.test("OKR_RULES_BLOCK_QUARTER унаследовал НОВУЮ редакцию OBJ-AMBITIOUS", () => {
  assert(
    OKR_RULES_BLOCK_QUARTER.includes("соответствует выбранному горизонту"),
    "Квартальный блок должен содержать обновлённую формулировку OBJ-AMBITIOUS",
  );
  const line = OKR_RULES_BLOCK_QUARTER
    .split("\n")
    .find((l) => l.trim().startsWith("- OBJ-AMBITIOUS")) ?? "";
  assert(
    !/ограничен[а-я]*\s+(по\s+)?времени/i.test(line),
    `OBJ-AMBITIOUS в квартальном блоке не должна требовать срока. Получили: ${line}`,
  );
});

// --- KR-BASELINE-TARGET: распознавание baseline→target в тексте ---

Deno.test("BASE_RULES: KR-BASELINE-TARGET явно описывает распознавание baseline→target внутри текста KR", () => {
  const line = OKR_RULES_BLOCK.split("\n").find((l) => l.trim().startsWith("- KR-BASELINE-TARGET")) ?? "";
  assert(line.length > 0, "Строка KR-BASELINE-TARGET должна присутствовать");
  assert(
    line.includes("с X до Y") && line.includes("baseline→target в самом тексте"),
    `KR-BASELINE-TARGET должна явно описывать распознавание чисел в тексте. Получили: ${line}`,
  );
});

Deno.test("OKR_RULES_BLOCK_QUARTER унаследовал расширенную формулировку KR-BASELINE-TARGET", () => {
  assert(
    OKR_RULES_BLOCK_QUARTER.includes("baseline→target в самом тексте"),
    "Квартальный блок должен содержать расширенную формулировку KR-BASELINE-TARGET",
  );
});

// --- Разведение пространств имён: старые id мертвы, новые — единственный источник ---

const NEW_IDS = [
  "OBJ-QUALITATIVE",
  "OBJ-AMBITIOUS",
  "OBJ-NO-NUMBERS",
  "KR-MEASURABLE",
  "KR-BASELINE-TARGET",
  "KR-OUTCOME",
  "KR-TIMEBOUND",
  "KR-LEADING",
];

Deno.test("BASE_RULES содержит все 8 новых id как токены в начале строк-правил", () => {
  for (const id of NEW_IDS) {
    assert(
      OKR_RULES_BLOCK.includes(`- ${id} `),
      `Правило '${id}' должно присутствовать в BASE_RULES как активный токен`,
    );
  }
});

Deno.test("BASE_RULES НЕ содержит старых id-правил как активных токенов (- Xn [)", () => {
  for (const dead of ["O1", "O2", "O3", "KR1", "KR2", "KR3", "KR4", "KR10"]) {
    const pattern = new RegExp(`-\\s+${dead}\\s+\\[`);
    assert(
      !pattern.test(OKR_RULES_BLOCK),
      `Старый id-правило '${dead}' не должен использоваться как активный токен в BASE_RULES`,
    );
    assert(
      !pattern.test(OKR_RULES_BLOCK_QUARTER),
      `Старый id-правило '${dead}' не должен использоваться как активный токен в OKR_RULES_BLOCK_QUARTER`,
    );
  }
});

Deno.test("OKR_RULES_BLOCK_QUARTER использует KR-LEADING в override-правиле, не KR10", () => {
  const line = OKR_RULES_BLOCK_QUARTER
    .split("\n")
    .find((l) => l.trim().startsWith("- KR-LEADING [critical, override]")) ?? "";
  assert(line.length > 0, `override-правило должно быть под именем KR-LEADING. Строки: ${OKR_RULES_BLOCK_QUARTER}`);
  assert(!/- KR10 \[/.test(OKR_RULES_BLOCK_QUARTER), "старое имя KR10 не должно присутствовать в override");
});

Deno.test("OKR_RULES_BLOCK_QUARTER использует Q-FOCUS/Q-THEME/Q-REACH (верхний регистр), не старые Q-Focus", () => {
  for (const q of ["Q-FOCUS", "Q-THEME", "Q-REACH"]) {
    assert(OKR_RULES_BLOCK_QUARTER.includes(`- ${q} [`), `${q} должно присутствовать в OKR_RULES_BLOCK_QUARTER`);
  }
  for (const dead of ["Q-Focus", "Q-Theme", "Q-Reach"]) {
    assert(
      !new RegExp(`-\\s+${dead}\\s+\\[`).test(OKR_RULES_BLOCK_QUARTER),
      `Старое имя ${dead} не должно использоваться как активный токен`,
    );
  }
});

Deno.test("BASE_RULES содержит явную сноску про разведение id-правил и номеров KR пользователя", () => {
  // Сноска живёт в файле okr_rules.ts как комментарий над BASE_RULES; проверяем
  // читая исходник, чтобы гарантировать её присутствие.
  const src = Deno.readTextFileSync(new URL("./okr_rules.ts", import.meta.url));
  assert(
    /НЕ номера ключевых результатов пользователя/i.test(src),
    "okr_rules.ts должен содержать сноску про разведение id-правил и номеров KR пользователя",
  );
});

// --- textGuards smoke ---

Deno.test("containsDigits: распознаёт год в тексте Objective", () => {
  assert(containsDigits("Удвоить выручку к 2026 году") === true);
});

Deno.test("containsDigits: чистый текст без цифр → false", () => {
  assert(containsDigits("Стать предсказуемой опорой роста для команды") === false);
});

// --- few-shot эталоны по горизонтам ---

Deno.test("getFewShotBlock упоминает KR-OUTCOME и KR-LEADING вместо KR3/KR10", () => {
  for (const h of ["quarter_3m", "block_12m", "strategic_3y"]) {
    const b = getFewShotBlock(h);
    assert(b.includes("KR-OUTCOME"), `${h}: должен упоминать KR-OUTCOME`);
    assert(b.includes("KR-LEADING"), `${h}: должен упоминать KR-LEADING`);
    assert(!/\bKR3\b/.test(b), `${h}: старое имя KR3 не должно встречаться. Получили: ${b}`);
    assert(!/\bKR10\b/.test(b), `${h}: старое имя KR10 не должно встречаться. Получили: ${b}`);
  }
});

Deno.test("getFewShotBlock('quarter_3m'): KR-OUTCOME замер спринт/месяц, KR-LEADING leading на спринте", () => {
  const b = getFewShotBlock("quarter_3m");
  assert(/KR-OUTCOME/.test(b) && /помесячно|спринт/i.test(b), `KR-OUTCOME quarter должен содержать спринт/месячный замер: ${b}`);
  assert(/KR-LEADING/.test(b) && /спринт/i.test(b), `KR-LEADING quarter leading должен упоминать спринт: ${b}`);
});

Deno.test("getFewShotBlock('block_12m'): KR-OUTCOME содержит квартальный замер", () => {
  const b = getFewShotBlock("block_12m");
  assert(/KR-OUTCOME/.test(b) && /поквартально|квартал/i.test(b), `KR-OUTCOME 12m должен содержать квартальный замер: ${b}`);
});

Deno.test("getFewShotBlock('strategic_3y'): KR-OUTCOME содержит годовой/полугодовой замер", () => {
  const b = getFewShotBlock("strategic_3y");
  assert(/KR-OUTCOME/.test(b) && /полугодие|год/i.test(b), `KR-OUTCOME 3y должен содержать годовой/полугодовой замер: ${b}`);
});

Deno.test("getFewShotBlock: симметрия — в каждом блоке ≥2 ПЛОХО и ≥2 ОТЛИЧНО (KR-OUTCOME + KR-LEADING)", () => {
  for (const h of ["quarter_3m", "block_12m", "strategic_3y"]) {
    const b = getFewShotBlock(h);
    const bad = (b.match(/ПЛОХО/g) ?? []).length;
    const good = (b.match(/ОТЛИЧНО/g) ?? []).length;
    assert(bad >= 2, `${h}: ожидали ≥2 маркера ПЛОХО, получили ${bad}`);
    assert(good >= 2, `${h}: ожидали ≥2 маркера ОТЛИЧНО, получили ${good}`);
  }
});
