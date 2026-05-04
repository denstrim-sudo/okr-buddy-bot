import type { GeneratedSolution } from "@/types/okr";

export const fallbackSolutions: GeneratedSolution[] = [
  {
    id: "S1",
    problem: "Новые пользователи бросают пустой воркспейс в первый день",
    bet: "проведём новичка через 3-минутный интерактивный сетап",
    result_image: "пользователь совершит первое ценное действие до выхода из первой сессии",
    leading_metric: "Активация на 1-й день",
    confidence: "High",
    effort: "M",
    validation: "Прототип + 5 пользовательских тестов",
  },
  {
    id: "S2",
    problem: "На 3–7 день пользователям не за чем возвращаться",
    bet: "запустим персонализированный недельный дайджест незавершённой ценности",
    result_image: "сессии на 7-й день станут привычкой, а не прерыванием",
    leading_metric: "Кривая удержания D7",
    confidence: "Medium",
    effort: "S",
    validation: "A/B-тест email, 2 недели",
  },
  {
    id: "S3",
    problem: "Опытные пользователи испытывают трение при шеринге результатов с командой",
    bet: "уберём барьер активации при приглашении коллег",
    result_image: "каждый активный пользователь приведёт в среднем 1.4 коллеги",
    leading_metric: "Виральный коэффициент (k-factor)",
    confidence: "Medium",
    effort: "L",
    validation: "Discovery-спринт",
  },
];
