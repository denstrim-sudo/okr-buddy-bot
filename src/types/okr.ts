export interface GeneratedSolution {
  id: string;
  problem: string;
  bet: string;
  result_image: string;
  leading_metric: string;
  confidence: "Low" | "Medium" | "High";
  effort: "S" | "M" | "L" | "XL";
  validation: string;
}

export interface GeneratedKR {
  text: string;
  baseline: string;
  target: string;
  metric: string;
  kr_type: "leading" | "lagging";
  solutions: GeneratedSolution[];
}

export interface GeneratedPlan {
  objective_refined: string;
  score: number;
  key_results: GeneratedKR[];
}

export interface ValidationRule {
  id: string;
  label: string;
  pass: boolean;
  hint: string;
}

export interface ValidationReport {
  score: number;
  status: "pass" | "warn" | "fail";
  summary: string;
  rules: ValidationRule[];
  rewritten_objective: string;
  rewritten_key_results: string[];
}

export interface ValidationDraft {
  objective: string;
  key_results: string[];
}

export interface SolutionReport {
  score: number;
  status: "pass" | "warn" | "fail";
  summary: string;
  rules: ValidationRule[];
  rewritten_solution: GeneratedSolution;
}
