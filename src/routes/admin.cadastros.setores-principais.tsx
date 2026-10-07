import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/cadastros/setores-principais")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/cadastros/locais" });
  },
  component: () => null,
});
