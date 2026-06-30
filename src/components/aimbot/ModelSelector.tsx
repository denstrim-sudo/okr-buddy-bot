import { Cpu } from "lucide-react";
import { useAiModel } from "@/contexts/ModelContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const ModelSelector = () => {
  const { model, setModel, models, loading } = useAiModel();
  return (
    <div className="flex items-center gap-1.5">
      <Cpu className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
      <Select value={model} onValueChange={setModel} disabled={loading}>
        <SelectTrigger
          aria-label="Модель AI"
          title="Список загружен с AI-провайдера. Если выбранная модель временно недоступна, запрос будет выполнен через GPT-4o — вы увидите уведомление."
          className="h-9 w-[150px] rounded-lg border-border bg-card text-xs sm:w-[180px] sm:text-sm"
        >
          <SelectValue placeholder={loading ? "Загрузка моделей…" : "Модель AI"} />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
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
