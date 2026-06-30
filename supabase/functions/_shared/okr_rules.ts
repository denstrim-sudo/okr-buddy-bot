// Каноничный набор правил аудита OKR (Doerr / OKR-PI).
// Используется И в draft-okr (самооценка score_hint), И в validate-okr (полный аудит) —
// чтобы оба модуля судили OKR по одной и той же шкале.

const BASE_RULES = `- O1 [important]  Objective качественный и вдохновляющий, не метрика.
- O2 [important]  Objective амбициозный, запоминающийся, по масштабу и смыслу соответствует выбранному горизонту (НЕ требует явного срока/даты/номера периода в тексте — горизонт уже зафиксирован отдельным полем "horizon").
- O3 [critical]   В Objective НЕТ KPI, процентов и цифр.
- KR1 [critical]  Каждый KR измерим (число/метрика, не активность).
- KR2 [critical]  У каждого KR явные baseline и target (FROM → TO). Это ОБЯЗАТЕЛЬНО распознавать и внутри обычного текста KR, не только в отдельных полях: формулировки вида «с X до Y», «X → Y», «вырастет/увеличится с X до Y», «с X% до Y%», «с 500 тысяч до 750 тысяч» — это ВАЛИДНЫЙ baseline→target в самом тексте, НЕ проваливай KR2 из-за этого. Провал KR2 — только если в тексте KR и в полях baseline/target ДЕЙСТВИТЕЛЬНО нет ни одного числового ориентира ни для начала, ни для цели.
- KR3 [critical]  KR описывают ИСХОДЫ, а не задачи. Запрещены корневые глаголы:
                  «провести», «поддержать», «запустить», «построить», «разработать», «внедрить»,
                  "conduct", "support", "build", "launch", "develop", "ship".
- KR4 [important] KR ограничены по времени и имеют градиент прогресса (не бинарные).
- KR10 [important] Хотя бы один KR — LEADING (опережающий) индикатор.`;

const SCORING_BLOCK = `SEVERITY:
- critical — без исправления OKR методологически некорректен.
- important — снижает качество, но OKR работоспособен.
- improve — точечное усиление формулировки.

SCORING (используй ЭТУ формулу для score_hint и для общего score):
weights: critical=3, important=2, improve=1.
score = round(100 * sum(weights of passed rules) / sum(weights of all rules)).
ЖЁСТКИЙ ПОТОЛОК: если провалено ≥1 правила с severity="critical" — score ≤ 60.`;

export const OKR_RULES_BLOCK = `OKR AUDIT RULES (canonical, single source of truth):

${BASE_RULES}

${SCORING_BLOCK}`;

// Дополнительный набор правил для квартального OKR (3 месяца).
// Применяется ПОВЕРХ базовых правил — KR10 повышается до critical, добавляются Q-Focus и Q-Theme.
export const OKR_RULES_BLOCK_QUARTER = `OKR AUDIT RULES — QUARTERLY OKR (3 months, canonical):

${BASE_RULES}

QUARTER-SPECIFIC OVERRIDES & ADDITIONS:
- KR10 [critical, override]  Для квартала: хотя бы один KR ДОЛЖЕН быть LEADING. Без leading-индикатора квартальный OKR неуправляем — за 90 дней lag-метрика не успеет сдвинуться. Если ни одного leading KR нет, KR10 → fail с severity=critical.
- Q-Focus [important]  Квартальный OKR: 1 Objective + 2..4 Key Results (3 — оптимум). Больше 4 — расфокусировка квартала, fail.
- Q-Theme [improve]  Objective связан с ОДНОЙ фокус-темой квартала, а не сборником разнородных инициатив. Если Objective склеивает 2+ независимые темы — fail.
- Q-Reach [important]  Дельта baseline→target должна быть достижима за 90 дней от текущей точки. Если target явно требует >1 квартала (например, годовая цель целиком перенесена в квартал) — fail с подсказкой «разбейте на кварталы».

${SCORING_BLOCK}`;

export function getRulesBlock(horizon?: string): string {
  return horizon === "quarter_3m" ? OKR_RULES_BLOCK_QUARTER : OKR_RULES_BLOCK;
}
