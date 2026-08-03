import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Field {
  name: string;
  label: string;
  type?: string;
}

interface Props {
  breadcrumb: string;
  title: string;
  fields: Field[];
}

export function CadastroPage({ breadcrumb, title, fields }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">{breadcrumb}</p>
        <h2 className="text-2xl text-foreground">{title}</h2>
      </div>
      <Card className="p-6">
        <form
          className="space-y-4 max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          {fields.map((f) => (
            <div key={f.name} className="space-y-2">
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input id={f.name} type={f.type ?? "text"} placeholder={f.label} />
            </div>
          ))}
          <Button type="submit">Salvar</Button>
        </form>
      </Card>
    </div>
  );
}
