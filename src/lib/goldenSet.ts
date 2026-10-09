/**
 * Эталонный набор для проверки стабильности аудита (validate-okr).
 *
 * Источник: методология банка OKR-PI, раздел 6.1 «Восемь эталонных OKR»,
 * правила — по обновлению OKR-PI от 09.10.2026 (чек-лист О1–О17).
 * Цифры иллюстративные, взяты из методологии как есть.
 *
 * P* — эталоны, которые должны проходить по указанным правилам.
 * N* — «испорченные» версии эталонов: каждая ломает ровно одно правило.
 *
 * expect.pass / expect.fail / expect.notApplicable перечисляют ТОЛЬКО те правила,
 * в вердикте которых мы уверены по методологии. Остальные правила не проверяются
 * на точность, но участвуют в замере стабильности (совпадение между прогонами).
 */

export type GoldenOkrType = "committed" | "aspirational" | "mixed";
/** Происхождение OKR (обновление OKR-PI от 09.10.2026, раздел 5). */
export type GoldenOkrOrigin = "growth_direction" | "protection_direction" | "regular";

/** Условный владелец для эталонов: правило О9 проверяет только, что владелец назван. */
export const TEST_OWNER = "Тестовый владелец";

export interface GoldenCase {
  id: string;
  title: string;
  /** Откуда взят случай и что в нём изменено. */
  source: string;
  objective: string;
  key_results: string[];
  horizon: "strategic_3y" | "block_12m" | "quarter_3m";
  okr_type?: GoldenOkrType;
  okr_origin: GoldenOkrOrigin;
  /** Владелец OKR (О9). Пустая строка — не назван. */
  owner: string;
  /** Способ достижения известен (О17, только для обычного OKR). По умолчанию true. */
  way_known?: boolean;
  expect: {
    pass?: string[];
    fail?: string[];
    notApplicable?: string[];
  };
}

// ---------------------------------------------------------------------------
// Тексты эталонов (OKR-PI 6.1)
// ---------------------------------------------------------------------------

const P1_OBJ = "Клиент получает кредитное решение быстрее, чем успевает передумать.";
const P1_KR = [
  "Конверсия «заявка → выдача» в мобильном канале с 18% до 26%",
  "Доля автоматических решений до 2 минут с 40% до 75%, контрольные точки по каждому PI",
  "Просрочка 30+ по новым выдачам не выше текущего уровня + 0,3 п.п.",
  "К концу первого PI известно, какой способ даёт больший вклад в конверсию: сокращение анкеты или предодобрение по данным зарплатного проекта",
];

const P2_OBJ = "Любая продуктовая команда выкатывает изменение в прод в день готовности.";
const P2_KR = [
  "Медианное время от готовности до прода с 14 до 3 дней",
  "70% продуктовых команд на общем конвейере",
  "Доля неуспешных выкаток остаётся не выше 15%",
  "К середине PI на пяти командах замерено, где главное ожидание: согласования ИБ, тестовые стенды или ручной регресс",
];

const P3_OBJ = "Клиент не замечает, что сегодня день зарплаты.";
const P3_KR = [
  "Доступность входа, переводов и оплат через ЕРИП в пиковые дни остаётся не ниже 99,9%",
  "Восстановление после сбоя остаётся не дольше 30 минут",
  "Частота релизов остаётся не ниже текущей",
];

const P4_OBJ = "Требования регулятора внедряем спокойно и с запасом.";
const P4_KR = [
  "100% регуляторных изменений в проде не позже чем за 10 рабочих дней до срока",
  "Ёмкость на регуляторику закладывается при планировании PI, без изъятий внутри PI",
  "Ноль переносов бизнес-обязательств из-за регуляторных авралов",
];

const P5_OBJ = "Новый клиент становится активным в первый же день.";
const P5_KR = [
  "Доля клиентов с первой транзакцией за 24 часа с 35% до 60%",
  "Доля открытий без визита в отделение с 50% до 80%",
  "Фрод-попытки и отказы идентификации остаются не выше текущего уровня",
  "К концу первого PI известно, на каком шаге воронки, включая шаг МСИ, теряется больше всего клиентов",
];

const P6_OBJ = "Клиент защищён от мошенников и не страдает от защиты.";
const P6_KR = [
  "Потери от мошенничества на 1 млн операций снижены на 30%",
  "Доля ложных блокировок с 2% до 0,8%",
  "Новое правило попадает в прод за 4 часа вместо 5 дней",
  "К концу PI на исторических данных проверены две поведенческие модели, известна точность каждой",
];

const P7_OBJ = "Обещания бизнесу становятся надёжными.";
const P7_KR = [
  "CvsC по обязательным OKR остаётся в коридоре 80–100% три PI подряд",
  "Число одновременно активных Решений остаётся не выше измеренной пропускной способности",
  "Доля переносов между кварталами с 30% до 15%",
  "К концу PI посчитана пропускная способность за 2025–2026 и проверено, объясняет ли перегруз переносы",
];

const P8_OBJ = "Продуктовые изменения больше не упираются в ядро.";
const P8_KR = [
  "Доля Решений, заблокированных зависимостью от ядра, с 40% до 15%",
  "Время изменений, затрагивающих АБС, с 45 до 15 дней",
  "Ноль критических инцидентов из-за миграций",
  "К концу первого квартала на одном домене проверены два способа (обёртка через API или вынос модуля), известно время изменения в каждом",
];

// Условный пример защитного направления из обновления OKR-PI 09.10 (раздел 2).
// Objective взят из обновления; KR составлены помощником по правилам раздела 5.2,
// цифр банка нет — только X / Y.
const P9_OBJ = "Доход корпоративного блока перестаёт зависеть от пяти крупнейших клиентов.";
const P9_KR = [
  "Доля дохода блока от пяти крупнейших клиентов с X% до Y%",
  "Число клиентов блока с доходом выше порога Z с X до Y, контрольные точки по каждому PI",
  "Маржа по новым корпоративным клиентам остаётся не ниже текущей, пока растёт их число",
  "К концу первого PI известно, какой из двух каналов привлечения — отраслевые партнёрства или переход клиентов малого бизнеса в корпоративный сегмент — даёт больше клиентов с доходом выше порога Z",
];

// ---------------------------------------------------------------------------
// Набор
// ---------------------------------------------------------------------------

export const GOLDEN_SET: GoldenCase[] = [
  // ---------------- Эталоны ----------------
  {
    id: "P1",
    title: "Кредит в один клик",
    source: "OKR-PI 6.1, эталон 1",
    objective: P1_OBJ,
    key_results: P1_KR,
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      pass: ["OKR-TYPE-DECLARED", "OBJ-NO-NUMBERS", "KR-COUNT", "KR-REQUIRED-ANGLES", "KR-OUTCOME", "KR-QUALITY-PAIR", "KR-LEARNING-FORM", "OKR-OWNER", "OKR-WAY-KNOWN"],
    },
  },
  {
    id: "P2",
    title: "Платформа поставки",
    source: "OKR-PI 6.1, эталон 2",
    objective: P2_OBJ,
    key_results: P2_KR,
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      pass: ["OBJ-NO-NUMBERS", "KR-COUNT", "KR-REQUIRED-ANGLES", "KR-OUTCOME"],
    },
  },
  {
    id: "P3",
    title: "Надёжность в пиковые дни",
    source: "OKR-PI 6.1, эталон 3",
    objective: P3_OBJ,
    key_results: P3_KR,
    horizon: "block_12m",
    okr_type: "committed",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      pass: ["OBJ-NO-NUMBERS", "KR-COUNT", "KR-REQUIRED-ANGLES", "KR-MEASURABLE"],
      notApplicable: ["KR-OUTCOME"],
    },
  },
  {
    id: "P4",
    title: "Регуляторные изменения НБРБ",
    source: "OKR-PI 6.1, эталон 4",
    objective: P4_OBJ,
    key_results: P4_KR,
    horizon: "block_12m",
    okr_type: "committed",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      pass: ["OBJ-NO-NUMBERS", "KR-COUNT"],
      notApplicable: ["KR-OUTCOME"],
    },
  },
  {
    id: "P5",
    title: "Цифровой онбординг через МСИ",
    source: "OKR-PI 6.1, эталон 5",
    objective: P5_OBJ,
    key_results: P5_KR,
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      pass: ["OBJ-NO-NUMBERS", "KR-COUNT", "KR-REQUIRED-ANGLES", "KR-OUTCOME", "KR-QUALITY-PAIR"],
    },
  },
  {
    id: "P6",
    title: "Антифрод без лишнего трения",
    source: "OKR-PI 6.1, эталон 6",
    objective: P6_OBJ,
    key_results: P6_KR,
    horizon: "block_12m",
    okr_type: "mixed",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      pass: ["OBJ-NO-NUMBERS", "KR-COUNT", "KR-REQUIRED-ANGLES", "KR-QUALITY-PAIR"],
    },
  },
  {
    id: "P7",
    title: "Предсказуемость системы управления",
    source: "OKR-PI 6.1, эталон 7",
    objective: P7_OBJ,
    key_results: P7_KR,
    horizon: "block_12m",
    okr_type: "committed",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      pass: ["OBJ-NO-NUMBERS", "KR-COUNT", "KR-REQUIRED-ANGLES"],
    },
  },
  {
    id: "P8",
    title: "Модернизация ядра АБС",
    source: "OKR-PI 6.1, эталон 8",
    objective: P8_OBJ,
    key_results: P8_KR,
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      pass: ["OBJ-NO-NUMBERS", "KR-COUNT", "KR-REQUIRED-ANGLES", "KR-OUTCOME", "KR-LEARNING-FORM"],
    },
  },

  {
    id: "P9",
    title: "Зависимость от пяти клиентов (защитное направление)",
    source: "Обновление OKR-PI 09.10, раздел 2 (условный пример); KR составлены помощником",
    objective: P9_OBJ,
    key_results: P9_KR,
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "protection_direction",
    owner: TEST_OWNER,
    expect: {
      pass: ["OKR-TYPE-DECLARED", "OBJ-NO-NUMBERS", "KR-COUNT", "KR-REQUIRED-ANGLES", "KR-OUTCOME", "OKR-OWNER"],
    },
  },

  // ---------------- Испорченные версии ----------------
  {
    id: "N1",
    title: "Кредит в один клик без KR обучения",
    source: "P1 как OKR из направления роста, убран KR [У] (нужны [К] + [У], О-таблица 5.2)",
    objective: P1_OBJ,
    key_results: P1_KR.slice(0, 3),
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "growth_direction",
    owner: TEST_OWNER,
    expect: {
      fail: ["KR-REQUIRED-ANGLES"],
      pass: ["KR-COUNT", "OBJ-NO-NUMBERS"],
    },
  },
  {
    id: "N2",
    title: "Антифрод без пары качества",
    source: "P6, убран KR ложных блокировок, тип амбициозный",
    objective: P6_OBJ,
    key_results: [P6_KR[0], P6_KR[2], P6_KR[3]],
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      fail: ["KR-QUALITY-PAIR"],
      pass: ["KR-COUNT", "OBJ-NO-NUMBERS"],
    },
  },
  {
    id: "N3",
    title: "Онбординг: цифра в цели",
    source: "P5, в Objective добавлена цифра",
    objective: "Новый клиент становится активным в первый же день: 60% новых клиентов с операцией за сутки.",
    key_results: P5_KR,
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      fail: ["OBJ-NO-NUMBERS"],
      pass: ["KR-COUNT"],
    },
  },
  {
    id: "N4",
    title: "Модернизация АБС: KR исполнения в направлении",
    source: "P8, статус «направление», первый KR заменён на исполнение",
    objective: P8_OBJ,
    key_results: ["Внедрить новую версию ядра АБС до конца года", P8_KR[1], P8_KR[2], P8_KR[3]],
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "growth_direction",
    owner: TEST_OWNER,
    expect: {
      fail: ["KR-OUTCOME"],
      pass: ["KR-COUNT", "OBJ-NO-NUMBERS"],
    },
  },
  {
    id: "N5",
    title: "Надёжность как OKR из направления роста",
    source: "P3 как OKR из направления роста (нет KR [У], нужны [К] + [У])",
    objective: P3_OBJ,
    key_results: P3_KR,
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "growth_direction",
    owner: TEST_OWNER,
    expect: {
      fail: ["KR-REQUIRED-ANGLES"],
      pass: ["KR-COUNT", "OBJ-NO-NUMBERS"],
    },
  },
  {
    id: "N6",
    title: "Кредит в один клик: формальный KR обучения",
    source: "P1, KR [У] заменён на «провести исследование»",
    objective: P1_OBJ,
    key_results: [P1_KR[0], P1_KR[1], P1_KR[2], "Провести исследование клиентского пути заёмщика в мобильном приложении"],
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      fail: ["KR-LEARNING-FORM"],
      pass: ["KR-COUNT", "OBJ-NO-NUMBERS"],
    },
  },
  {
    id: "N7",
    title: "Онбординг: шесть KR",
    source: "P5, добавлены два KR-работы",
    objective: P5_OBJ,
    key_results: [
      ...P5_KR,
      "Запустить новый экран приветствия в мобильном приложении",
      "Обучить сотрудников контакт-центра сценарию онбординга",
    ],
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      fail: ["KR-COUNT", "KR-OUTCOME"],
      pass: ["OBJ-NO-NUMBERS"],
    },
  },
  {
    id: "N8",
    title: "Кредит в один клик: способ в цели",
    source: "P1, в Objective зашит способ",
    objective: "Ускорить выдачу кредитов за счёт внедрения новой скоринговой платформы.",
    key_results: P1_KR,
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      fail: ["OBJ-QUALITATIVE"],
      pass: ["KR-COUNT", "OBJ-NO-NUMBERS"],
    },
  },
  {
    id: "N9",
    title: "Кредит в один клик без типа",
    source: "P1, тип не объявлен",
    objective: P1_OBJ,
    key_results: P1_KR,
    horizon: "block_12m",
    okr_type: undefined,
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      fail: ["OKR-TYPE-DECLARED"],
      pass: ["KR-COUNT", "OBJ-NO-NUMBERS", "KR-REQUIRED-ANGLES"],
    },
  },
  {
    id: "N10",
    title: "Защитное направление без KR [О]",
    source: "P9, убран KR [О] (для защитного направления нужны [К] + [О] + [У])",
    objective: P9_OBJ,
    key_results: [P9_KR[0], P9_KR[1], P9_KR[3]],
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "protection_direction",
    owner: TEST_OWNER,
    expect: {
      fail: ["KR-REQUIRED-ANGLES"],
      pass: ["KR-COUNT", "OBJ-NO-NUMBERS"],
    },
  },
  {
    id: "N11",
    title: "Обычный OKR без KR [О]",
    source: "P1, убран KR [О] (для обычного OKR нужны [К] + [О], О16)",
    objective: P1_OBJ,
    key_results: [P1_KR[0], P1_KR[1], P1_KR[3]],
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "regular",
    owner: TEST_OWNER,
    expect: {
      fail: ["KR-REQUIRED-ANGLES"],
      pass: ["KR-COUNT", "OBJ-NO-NUMBERS"],
    },
  },
  {
    id: "N12",
    title: "Предсказуемость без владельца",
    source: "P7, владелец не назван (О9)",
    objective: P7_OBJ,
    key_results: P7_KR,
    horizon: "block_12m",
    okr_type: "committed",
    okr_origin: "regular",
    owner: "",
    expect: {
      fail: ["OKR-OWNER"],
      pass: ["KR-COUNT", "OBJ-NO-NUMBERS"],
    },
  },
  {
    id: "N13",
    title: "Платформа поставки: способ неизвестен",
    source: "P2 как обычный OKR, способ достижения неизвестен (О17: кандидат в защитное направление)",
    objective: P2_OBJ,
    key_results: P2_KR,
    horizon: "block_12m",
    okr_type: "aspirational",
    okr_origin: "regular",
    owner: TEST_OWNER,
    way_known: false,
    expect: {
      fail: ["OKR-WAY-KNOWN"],
      pass: ["KR-COUNT", "OBJ-NO-NUMBERS"],
    },
  },
];
