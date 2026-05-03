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
