import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  onConfirm: () => void;
}

export const ResetAllButton = ({ onConfirm }: Props) => {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Сбросить все данные"
          className="h-9 border-border text-muted-foreground hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive"
        >
          <RotateCcw className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
          <span className="hidden sm:inline">Сбросить всё</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Сбросить все данные?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>Будут удалены безвозвратно:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Сохранённые OKR (всё дерево)</li>
                <li>Solution Studio — гипотезы и решения по всем KR</li>
                <li>Загруженные документы всех категорий</li>
                <li>Текущий черновик генератора OKR и аудита</li>
              </ul>
              <p className="pt-1 text-muted-foreground">Действие необратимо.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Сбросить всё
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
