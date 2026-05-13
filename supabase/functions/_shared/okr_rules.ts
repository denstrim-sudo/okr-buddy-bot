// Каноничный набор правил аудита OKR (Doerr / OKR-PI).
// Используется И в draft-okr (самооценка score_hint), И в validate-okr (полный аудит) —
// чтобы оба модуля судили OKR по одной и той же шкале.

export const OKR_RULES_BLOCK = `OKR AUDIT RULES (canonical, single source of truth):

- O1 [important]  Objective качественный и вдохновляющий, не метрика.
- O2 [important]  Objective амбициозный, ограниченный по времени, запоминающийся.
- O3 [critical]   В Objective НЕТ KPI, процентов и цифр.
- KR1 [critical]  Каждый KR измерим (число/метрика, не активность).
- KR2 [critical]  У каждого KR явные baseline и target (FROM → TO). Пустые baseline/target = провал KR2, даже если в warnings указано «нет данных».
- KR3 [critical]  KR описывают ИСХОДЫ, а не задачи. Запрещены корневые глаголы:
                  «провести», «поддержать», «запустить», «построить», «разработать», «внедрить»,
                  "conduct", "support", "build", "launch", "develop", "ship".
- KR4 [important] KR ограничены по времени и имеют градиент прогресса (не бинарные).
- KR10 [important] Хотя бы один KR — LEADING (опережающий) индикатор.

SEVERITY:
- critical — без исправления OKR методологически некорректен.
- important — снижает качество, но OKR работоспособен.
- improve — точечное усиление формулировки.

SCORING (используй ЭТУ формулу для score_hint и для общего score):
weights: critical=3, important=2, improve=1.
score = round(100 * sum(weights of passed rules) / sum(weights of all rules)).
ЖЁСТКИЙ ПОТОЛОК: если провалено ≥1 правила с severity="critical" — score ≤ 60.`;
