import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const RESOURCE_TRANSFER_LIMIT_MESSAGE =
  "O limite de transferência de arquivo esgotou. É preciso renovar as credenciais do banco de dados ou realizar uma limpeza dos dados e itens. Consumo elevado.";

export function isResourceTransferBlocked() {
  return true;
}

interface ResourceTransferLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResourceTransferLimitDialog({
  open,
  onOpenChange,
}: ResourceTransferLimitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-destructive/50 bg-destructive text-destructive-foreground">
        <DialogHeader>
          <DialogTitle>Limite de transferência esgotado</DialogTitle>
          <DialogDescription className="text-destructive-foreground/90">
            {RESOURCE_TRANSFER_LIMIT_MESSAGE}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
