// Каноничный свод правил аудита OKR по методологии банка OKR-PI.
// Используется И в draft-okr (самооценка score_hint), И в validate-okr (полный аудит).
// Зависит от типа OKR (обязательный / амбициозный / смешанный) и статуса
// (направление / обычный OKR). Без них работает как «тип не объявлен, обычный OKR».

import { toCtx, type OkrStatus, type OkrType, type RuleCtx } from "./scoring.ts";

export type Angle = "К" | "О" | "У";

/** OKR-PI 3.3: обязательные ракурсы KR по типу OKR. */
export function requiredAngles(
  okr_type?: OkrType,
): Angle[] | { must: Angle[]; oneOf: Angle[] } | null {
  if (okr_type === "aspirational") return ["К", "У"];
  if (okr_type === "committed") return ["К", "О"];
  if (okr_type === "mixed") return { must: ["К"], oneOf: ["О", "У"] };
  return null;
}

/** Допустимое число KR: направление 2–4, обычный OKR 3–5. */
export function krCountRange(okr_status?: OkrStatus): [number, number] {
  return okr_status === "direction" ? [2, 4] : [3, 5];
}

const TYPE_LABEL: Record<string, string> = {
  committed: "обязательный",
  aspirational: "амбициозный",
  mixed: "смешанный",
};

export function okrTypeLabel(t?: OkrType): string {
  return t ? TYPE_LABEL[t] : "не объявлен";
}
export function okrStatusLabel(s?: OkrStatus): string {
  return s === "direction" ? "направление" : "обычный OKR";
}

function anglesLine(t?: OkrType): string {
  const r = requiredAngles(t);
  if (r === null) return "Тип OKR не объявлен — правило не применяется (сервер пометит его как неприменимое).";
  if (Array.isArray(r)) return `Для типа «${okrTypeLabel(t)}» обязательны ракурсы: ${r.map((a) => `[${a}]`).join(" и ")}.`;
  return `Для смешанного OKR обязателен [${r.must.join("]")}] и хотя бы один из ${r.oneOf.map((a) => `[${a}]`).join(" / ")}.`;
}

const ID_NOTE = `ВАЖНО: идентификаторы правил ниже (OBJ-*, KR-*) — это ИМЕНА ПРАВИЛ АУДИТА, а НЕ номера ключевых результатов пользователя. Когда ссылаешься на конкретный KR пользователя в hint/reasoning — указывай его по позиции ("второй KR", "KR №2"), а имя правила пиши как есть (KR-OUTCOME, KR-LEADING).`;

export const ANGLES_DEFINITION = `РАКУРСЫ KR (OKR-PI 3.3) — метки KR внутри одного OKR:
- [К] клиент и бизнес — изменение у клиента или в результате банка (доход, удержание, поведение клиента).
- [О] осуществимость и риски — удержание порога критичного: «остаётся выше X / ниже Y» по мере роста основного.
- [У] обучение — «к [дата] известно, [что], с порогом [какой]»: что банк узнает и проверит.`;

function buildBaseRules(ctx: ReturnType<typeof toCtx>): string {
  const [minKr, maxKr] = krCountRange(ctx.okr_status);
  const outcomeLine = ctx.okr_type === "committed" && ctx.okr_status === "regular"
    ? "Для обязательного обычного OKR глаголы исполнения ДОПУСТИМЫ (OKR-PI 3.4.8) — сервер пометит правило как неприменимое."
    : "В направлениях исполнение запрещено всегда.";
  const lines = [
    `- OBJ-NO-NUMBERS [critical]  В Objective НЕТ KPI, процентов и цифр.`,
    `- OBJ-QUALITATIVE [important]  Objective описывает изменение у клиентов или банка, без цифр и БЕЗ способа («через внедрение X», «за счёт запуска Y» = fail).`,
  ];
  if (ctx.okr_type === "aspirational" || ctx.okr_type === "mixed") {
    lines.push(`- OBJ-AMBITIOUS [important]  Objective амбициозный, запоминающийся, по масштабу соответствует выбранному горизонту (НЕ требует явного срока или даты в тексте).`);
  }
  lines.push(
    `- KR-COUNT [important]  Число KR от ${minKr} до ${maxKr} (${okrStatusLabel(ctx.okr_status)}).`,
    `- KR-MEASURABLE [critical]  Каждый KR измерим в одной из форм: «с X до Y», «с Y до X», «остаётся выше X», «остаётся ниже Y», либо форма обучения «к [дата] известно, [что], с порогом [какой]». Любая из этих форм = pass. Числа распознавай и внутри текста KR.`,
    `- KR-OUTCOME [critical]  KR описывают исходы, а не задачи. Запрещённые глаголы: «запустить», «внедрить», «перевести», «построить» (launch, implement, migrate, build). ${outcomeLine}`,
    `- KR-REQUIRED-ANGLES [${ctx.okr_status === "direction" ? "critical" : "important"}]  ${anglesLine(ctx.okr_type)} В hint назови, какого ракурса не хватает, и предложи KR этого ракурса под данный Objective.`,
    `- KR-QUALITY-PAIR [important]  Каждый KR на рост количества (выдачи, охват, скорость, объём) имеет в наборе KR качества, который не даёт выполнить первый за счёт клиента, риска или людей. Пример пары: «потери от мошенничества −30%» + «ложные блокировки с 2% до 0,8%».`,
    `- KR-LEARNING-FORM [important]  KR обучения содержит вопрос и порог. «Провести исследование / анализ» без вопроса и порога = fail (антипаттерн «формальный [У]»). Если в наборе нет KR обучения — pass (наличие проверяет KR-REQUIRED-ANGLES).`,
    `- KR-LEADING [${ctx.horizon === "quarter_3m" || ctx.okr_status === "direction" ? "critical" : "important"}]  Хотя бы один KR — опережающий. Для направления — хотя бы один [К] опережающий, с контрольными точками внутри года.`,
    `- KR-TIMEBOUND [important]  KR ограничены по времени и имеют градиент прогресса (не бинарные).`,
  );
  if (ctx.horizon === "quarter_3m") {
    lines.push(`- Q-REACH [important]  Сдвиг достижим за 90 дней от текущей точки. Если цель явно требует больше квартала — fail с подсказкой «разбейте на кварталы».`);
  }
  return `${ID_NOTE}\n\nТИП OKR: ${okrTypeLabel(ctx.okr_type)}. СТАТУС: ${okrStatusLabel(ctx.okr_status)}.\n\n${lines.join("\n")}\n\n${ANGLES_DEFINITION}`;
}

const SCORING_BLOCK = `SEVERITY:
- critical — без исправления OKR методологически некорректен.
- important — снижает качество, но OKR работоспособен.
- improve — точечное усиление формулировки.

SCORING (используй ЭТУ формулу для score_hint и для общего score):
weights: critical=3, important=2, improve=1.
score = round(100 * sum(weights of passed rules) / sum(weights of all rules)).
Неприменимые правила в score не учитываются.
ЖЁСТКИЙ ПОТОЛОК: если провалено ≥1 правила с severity="critical" — score ≤ 60.`;

export function getRulesBlock(ctxOrHorizon?: string | RuleCtx): string {
  const ctx = toCtx(ctxOrHorizon);
  const title = ctx.horizon === "quarter_3m"
    ? "OKR AUDIT RULES — QUARTERLY OKR (OKR-PI, canonical):"
    : "OKR AUDIT RULES (OKR-PI, canonical, single source of truth):";
  return `${title}\n\n${buildBaseRules(ctx)}\n\n${SCORING_BLOCK}`;
}

export const KR_FORM_DEFINITION = `form (форма KR): range — «с X до Y» / «с Y до X» / «на N%»; threshold — «остаётся выше/ниже», «не выше/не ниже», «≤», «≥», «ноль …»; learning — «к дате известно, что…, с порогом…»; execution — факт поставки к сроку; binary — выполнено / не выполнено без градиента; unmeasurable — нельзя понять, выполнен ли KR.
timing: leading — показатель, который меняется раньше результата и позволяет скорректироваться внутри периода; lagging — итоговый результат, видимый в конце периода.`;

export const SERVER_COMPUTED_RULES = ["OBJ-NO-NUMBERS", "KR-OUTCOME", "KR-MEASURABLE", "KR-TIMEBOUND", "KR-LEADING", "KR-COUNT", "KR-REQUIRED-ANGLES"];

/**
 * Свод для АУДИТОРА: только смысловые правила, которые оценивает модель.
 * Формальные и разметочные правила считает сервер (замер стабильности).
 * Редактор/генератор по-прежнему получают полный getRulesBlock.
 */
export function getAuditorRulesBlock(ctxOrHorizon?: string | RuleCtx): string {
  const ctx = toCtx(ctxOrHorizon);
  const full = buildBaseRules(ctx);
  const kept = full.split("\n").filter((line) => !SERVER_COMPUTED_RULES.some((id) => line.startsWith(`- ${id} [`)));
  return `OKR AUDIT RULES — ОЦЕНИВАЕШЬ ТОЛЬКО ЭТИ (OKR-PI):\n\n${kept.join("\n")}\n\n${SCORING_BLOCK}`;
}

/** Совместимость со старым кодом: блоки для «тип не объявлен, обычный OKR». */
export const OKR_RULES_BLOCK = getRulesBlock("block_12m");
export const OKR_RULES_BLOCK_QUARTER = getRulesBlock("quarter_3m");

// Эталоны банка по типу OKR. Каждый KR размечен ракурсом.
// OKR-PI 6.1 — эталон из методологии банка.
const EXAMPLE_ASPIRATIONAL = `ЭТАЛОН (амбициозный) — «Кредит в один клик». Владелец Решения — блок Рисков (у него главный компромисс «риск против конверсии»).
O: Клиент получает кредитное решение быстрее, чем успевает передумать.
- [К] Конверсия «заявка → выдача» в мобильном канале с 18% до 26% (показатель направления)
- [К] Доля автоматических решений до 2 минут с 40% до 75%, контрольные точки по каждому PI (опережающий)
- [О] Просрочка 30+ по новым выдачам не выше текущего уровня + 0,3 п.п.
- [У] К концу первого PI известно, какой способ даёт больший вклад в конверсию: сокращение анкеты или предодобрение по данным зарплатного проекта
На разборе: итог 0.7 по второму KR при выполненном [О] — успех.`;

const EXAMPLE_COMMITTED = `ЭТАЛОН (обязательный) — «Надёжность в пиковые дни»:
O: Клиент не замечает, что сегодня день зарплаты.
- [К] Доступность входа, переводов и оплат через ЕРИП в пиковые дни остаётся не ниже 99,9%
- [О] Восстановление после сбоя остаётся не дольше 30 минут
- [О] Частота релизов остаётся не ниже текущей
На разборе: формы удержания порога валидны, «с X до Y» не требуется.`;

const EXAMPLE_MIXED = `ЭТАЛОН (смешанный) — «Антифрод без лишнего трения»:
O: Клиент защищён от мошенников и не страдает от защиты.
- [К] Потери от мошенничества на 1 млн операций снижены на 30%
- [О] Доля ложных блокировок с 2% до 0,8%
- [У] К концу PI на исторических данных проверены две поведенческие модели, известна точность каждой
На разборе: пара количество/качество — потери уравновешены ложными блокировками, иначе цель выполняется «заблокировать всё».`;

const NEGATIVE_EXAMPLE = `ПЛОХО (Objective): «Активация действующих клиентов другими продуктами и сервисами»
→ почему плохо: покрывает любую работу блока и закрывается тем, что продаём активнее тем же клиентам.`;

const FEWSHOT_TESTS = `ТЕСТ ДЛЯ KR-OUTCOME: если KR выполнен на 100%, гарантирует ли это изменение у клиента или банка? Нет → это исполнение.
ТЕСТ ДЛЯ KR-LEADING: могу ли я повлиять на метрику за один под-период горизонта и увидеть сдвиг раньше финала? Да → опережающий. Под-период: стратегия → квартал/полугодие; годовой OKR → квартал; квартальный OKR → спринт/месяц.`;

export function getFewShotBlock(ctxOrHorizon?: string | RuleCtx): string {
  const ctx = toCtx(ctxOrHorizon);
  const example = ctx.okr_type === "aspirational"
    ? EXAMPLE_ASPIRATIONAL
    : ctx.okr_type === "committed"
      ? EXAMPLE_COMMITTED
      : EXAMPLE_MIXED;
  return `${example}\n\n${NEGATIVE_EXAMPLE}\n\n${FEWSHOT_TESTS}`;
}
