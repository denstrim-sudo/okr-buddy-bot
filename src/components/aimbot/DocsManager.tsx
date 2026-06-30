import { useRef, useState } from "react";
import { FileText, Upload, Trash2, BookOpen, Library, Lightbulb, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useDocs, type DocCategory } from "@/contexts/DocsContext";
import { parseDocument, ACCEPTED } from "@/lib/parseDocument";

const CATEGORIES: { key: DocCategory; label: string; hint: string; icon: React.ReactNode }[] = [
  { key: "okr_context", label: "Контекст OKR", hint: "Стратегия, команда, продукт — для модулей 1 и 3", icon: <BookOpen className="h-3.5 w-3.5" /> },
  { key: "methodology", label: "Методология", hint: "Книги, гайды, правила валидации — для модуля 2", icon: <Library className="h-3.5 w-3.5" /> },
  { key: "solutions_kb", label: "База знаний", hint: "Идеи, кейсы, исследования — для генератора решений", icon: <Lightbulb className="h-3.5 w-3.5" /> },
];

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

const BUDGET_LIMIT = 12000;
const fmtNum = (n: number) => n.toLocaleString("ru-RU");

export const DocsManager = () => {
  const { docs, add, remove, clear, buildContextWithUsage } = useDocs();
  const [active, setActive] = useState<DocCategory>("okr_context");
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const usage = buildContextWithUsage(["okr_context", "methodology", "solutions_kb"], BUDGET_LIMIT);
  const usageById = new Map(usage.docs.map((d) => [d.id, d]));

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setLoading(true);
    let ok = 0, fail = 0;
    for (const f of arr) {
      try {
        const text = await parseDocument(f);
        if (!text || text.length < 5) throw new Error("Пустой или нечитаемый файл");
        add({ name: f.name, category: active, text, size: f.size });
        ok++;
      } catch (e: any) {
        fail++;
        toast.error(`${f.name}: ${e?.message || "ошибка парсинга"}`);
      }
    }
    setLoading(false);
    if (ok) toast.success(`Загружено: ${ok}${fail ? ` · ошибок: ${fail}` : ""}`);
    if (inputRef.current) inputRef.current.value = "";
  };

  const items = docs.filter((d) => d.category === active);
  const totalChars = items.reduce((acc, d) => acc + d.text.length, 0);

  return (
    <Card className="border-border/60 bg-card p-6 shadow-md">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground shadow-sm">
            <FileText className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Документы и контекст</h3>
            <p className="text-xs text-muted-foreground">PDF · DOCX · TXT · MD · хранится только на эту сессию</p>
          </div>
        </div>
        {docs.length > 0 && (
          <Button onClick={() => { if (confirm("Удалить все документы?")) clear(); }} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <X className="mr-1 h-3.5 w-3.5" /> Очистить всё
          </Button>
        )}
      </header>

      <div className="mb-3 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const count = docs.filter((d) => d.category === c.key).length;
          const isActive = c.key === active;
          return (
            <button
              key={c.key}
              onClick={() => setActive(c.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors",
                isActive ? "border-primary bg-accent text-foreground shadow-sm" : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60",
              )}
            >
              {c.icon}
              <span className="font-medium">{c.label}</span>
              {count > 0 && <span className="rounded bg-background/70 px-1.5 font-mono text-[10px] text-foreground">{count}</span>}
            </button>
          );
        })}
      </div>

      <p className="mb-3 text-xs text-muted-foreground">{CATEGORIES.find((c) => c.key === active)?.hint}</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
          dragOver ? "border-primary bg-accent/40" : "border-border bg-secondary/20 hover:bg-secondary/40",
        )}
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Парсинг файлов...</p>
          </>
        ) : (
          <>
            <Upload className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Перетащите файлы или нажмите для выбора</p>
            <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, MD · можно несколько сразу</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {items.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{items.length} док. · {fmtSize(totalChars)} текста</span>
            <button onClick={() => { if (confirm("Очистить эту категорию?")) clear(active); }} className="hover:text-destructive">
              Очистить категорию
            </button>
          </div>
          <ul className="space-y-1.5">
            {items.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-foreground" title={d.name}>{d.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{fmtSize(d.text.length)}</span>
                <button onClick={() => remove(d.id)} className="text-muted-foreground hover:text-destructive" aria-label="Удалить">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};
