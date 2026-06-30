export type OkrHorizon = "strategic_3y" | "block_12m" | "quarter_3m";
export type OkrMode = "from_scratch" | "rewrite_existing";

export interface OkrInputInterpretation {
  detected_horizon: OkrHorizon;
  detected_mode: OkrMode;
  topic_summary: string;
  has_existing_okr: boolean;
  parsed_existing?: { objective?: string; key_results?: string[] };
  missing_info: string[];
  clarifying_questions: string[];
  assumptions: string[];
  warnings: string[];
}

export interface OkrDraftKR {
  text: string;
  baseline?: string;
  target?: string;
  metric?: string;
  kr_type: "leading" | "lagging";
  is_outcome: boolean;
  assumptions: string[];
  warnings: string[];
}

export type HorizonFitVerdict = "fits" | "too_short" | "too_long" | "mixed";

export interface HorizonFitItem {
  verdict: HorizonFitVerdict;
  reason: string;
  suggestion?: string;
}

export interface HorizonFitKR extends HorizonFitItem {
  index: number;
}

export interface HorizonFit {
  horizon: OkrHorizon;
  overall_verdict: HorizonFitVerdict;
  overall_score: number;
  objective: HorizonFitItem;
  key_results: HorizonFitKR[];
  notes: string[];
}

export interface OkrDraft {
  horizon: OkrHorizon;
  mode: OkrMode;
  objective: string;
  key_results: OkrDraftKR[];
  global_assumptions: string[];
  global_warnings: string[];
  score_hint: number;
  self_audit?: {
    critical_fails: string[];
    important_fails: string[];
  };
  horizon_fit?: HorizonFit;
}

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

export type RuleSeverity = "critical" | "important" | "improve";

export interface ValidationRule {
  id: string;
  label: string;
  pass: boolean;
  hint: string;
  severity?: RuleSeverity;
  why?: string;
}

export interface ValidationReport {
  score: number;
  status: "pass" | "warn" | "fail";
  summary: string;
  rules: ValidationRule[];
  rewritten_objective: string;
  rewritten_key_results: string[];
  /** True, если после одного корректирующего повтора rewritten_objective всё ещё содержит цифру.
   *  UI должен показать предупреждение, не блокируя пользователя. */
  rewritten_objective_warning?: boolean;
}

export interface ValidationKR {
  text: string;
  baseline?: string;
  target?: string;
  metric?: string;
  kr_type?: "leading" | "lagging";
}

export interface ValidationDraft {
  objective: string;
  key_results: string[];
  key_results_full?: ValidationKR[];
  horizon?: OkrHorizon;
}

export interface SolutionReport {
  score: number;
  status: "pass" | "warn" | "fail";
  summary: string;
  rules: ValidationRule[];
  rewritten_solution: GeneratedSolution;
}
