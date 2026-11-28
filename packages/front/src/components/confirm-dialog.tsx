import { type ReactElement, type ReactNode, useState } from "react";
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

/**
 * Confirmación de una acción que no se deshace, con el AlertDialog de shadcn en lugar de
 * `window.confirm`. Se abre con `trigger`, o desde fuera con `open` y `onOpenChange`.
 */
export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  /** Qué se pierde al confirmar. */
  description: ReactNode;
  /** Repite el verbo de la acción, p. ej. "Eliminar CV". */
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;

  return (
    <AlertDialog open={isOpen} onOpenChange={(next) => setOpen(next)}>
      {trigger && <AlertDialogTrigger render={trigger} />}
      <AlertDialogContent data-id="confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
