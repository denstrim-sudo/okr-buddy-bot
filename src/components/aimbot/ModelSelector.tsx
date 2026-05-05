import { Cpu } from "lucide-react";
import { AI_MODELS, useAiModel, type AiModelId } from "@/contexts/ModelContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const ModelSelector = () => {
  const { model, setModel } = useAiModel();
  return (
    <div className="flex items-center gap-1.5">
      <Cpu className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
      <Select value={model} onValueChange={(v) => setModel(v as AiModelId)}>
        <SelectTrigger
          aria-label="Модель AI"
          className="h-9 w-[150px] rounded-lg border-border bg-card text-xs sm:w-[180px] sm:text-sm"
        >
          <SelectValue placeholder="Модель AI" />
        </SelectTrigger>
        <SelectContent>
          {AI_MODELS.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              <div className="flex flex-col">
                <span className="font-medium">{m.label}</span>
                <span className="text-xs text-muted-foreground">{m.hint}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
