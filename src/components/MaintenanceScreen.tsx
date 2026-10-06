export function MaintenanceScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <section className="mx-auto w-full max-w-xl text-center">
        <img
          src="/maintenance-illustration.png"
          alt="Ilustração de uma tela em manutenção"
          width={205}
          height={115}
          className="mx-auto mb-7 h-auto w-[240px] max-w-full object-contain"
        />

        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Estamos realizando melhorias
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
          Estamos ajustando o banco de dados, os PDFs, os cadastros e o login para tornar o sistema
          mais simples e fácil de usar.
        </p>
        <p className="mt-5 text-lg font-semibold text-primary">Voltamos em breve.</p>
      </section>
    </main>
  );
}
