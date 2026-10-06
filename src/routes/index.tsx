import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  clearSelectedSharedRequesterId,
  getSelectedSharedRequesterProfile,
  setSelectedSharedRequesterId,
} from "@/lib/shared-sector-session";
import { getCurrentUserProfile, isSharedSectorProfile } from "@/lib/user-profile";
import {
  resolveLoginEmail,
  searchLoginSectors,
  searchLoginUsersBySector,
  type LoginSector,
  type SectorLoginUser,
} from "@/lib/login-options";

const MIN_LOGIN_QUERY_LENGTH = 2;

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [loginQuery, setLoginQuery] = useState("");
  const [password, setPassword] = useState("");
  const [sectorOptions, setSectorOptions] = useState<LoginSector[]>([]);
  const [selectedSector, setSelectedSector] = useState<LoginSector | null>(null);
  const [sectorUsers, setSectorUsers] = useState<SectorLoginUser[]>([]);
  const [selectedLogin, setSelectedLogin] = useState<SectorLoginUser | null>(null);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingSectorUsers, setLoadingSectorUsers] = useState(false);
  const [sectorUsersError, setSectorUsersError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = loginQuery.trim();
    if (selectedSector) {
      setSectorOptions([]);
      setOptionsOpen(false);
      setSearching(false);
      return;
    }

    if (query.length < MIN_LOGIN_QUERY_LENGTH) {
      setSectorOptions([]);
      setOptionsOpen(false);
      setSearching(false);
      setLookupError(null);
      return;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      setLookupError(null);

      void searchLoginSectors(query)
        .then((sectors) => {
          if (!active) return;
          setSectorOptions(sectors);
          setActiveOptionIndex(sectors.length > 0 ? 0 : -1);
          setOptionsOpen(true);
        })
        .catch(() => {
          if (!active) return;
          setSectorOptions([]);
          setLookupError("Não foi possível carregar a lista de setores. Tente novamente.");
          setOptionsOpen(true);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [loginQuery, selectedSector]);

  useEffect(() => {
    if (!selectedSector) {
      setSectorUsers([]);
      setLoadingSectorUsers(false);
      setSectorUsersError(null);
      return;
    }

    let active = true;
    setSectorUsers([]);
    setSectorUsersError(null);
    setLoadingSectorUsers(true);

    void searchLoginUsersBySector(selectedSector.key)
      .then((users) => {
        if (active) setSectorUsers(users);
      })
      .catch(() => {
        if (active) setSectorUsersError("Não foi possível carregar os usuários deste setor.");
      })
      .finally(() => {
        if (active) setLoadingSectorUsers(false);
      });

    return () => {
      active = false;
    };
  }, [selectedSector]);

  const handleLoginQueryChange = (value: string) => {
    setLoginQuery(value);
    setSelectedSector(null);
    setSectorOptions([]);
    setSectorUsers([]);
    setSelectedLogin(null);
    setPassword("");
    setLoadingSectorUsers(false);
    setSectorUsersError(null);
    setSearching(value.trim().length >= MIN_LOGIN_QUERY_LENGTH);
    setError(null);
    setLookupError(null);
    setActiveOptionIndex(-1);
    setOptionsOpen(value.trim().length >= MIN_LOGIN_QUERY_LENGTH);
    clearSelectedSharedRequesterId();
  };

  const handleChooseSector = (sector: LoginSector) => {
    setSelectedSector(sector);
    setLoginQuery(sector.name);
    setSelectedLogin(null);
    setPassword("");
    setError(null);
    setLookupError(null);
    setSectorUsersError(null);
    setOptionsOpen(false);
    setActiveOptionIndex(-1);
    clearSelectedSharedRequesterId();
  };

  const handleChooseUser = (user: SectorLoginUser) => {
    setSelectedLogin(user);
    setPassword("");
    setError(null);

    if (user.isShared && user.requesterId) {
      setSelectedSharedRequesterId(user.requesterId);
    } else {
      clearSelectedSharedRequesterId();
    }

    window.setTimeout(() => passwordInputRef.current?.focus(), 0);
  };

  const handleLoginKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && sectorOptions.length > 0) {
      event.preventDefault();
      setOptionsOpen(true);
      setActiveOptionIndex((current) => (current + 1) % sectorOptions.length);
      return;
    }

    if (event.key === "ArrowUp" && sectorOptions.length > 0) {
      event.preventDefault();
      setOptionsOpen(true);
      setActiveOptionIndex((current) => (current <= 0 ? sectorOptions.length - 1 : current - 1));
      return;
    }

    if (event.key === "Escape") {
      setOptionsOpen(false);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const activeSector = sectorOptions[activeOptionIndex];
      if (!selectedSector && activeSector) {
        handleChooseSector(activeSector);
      } else if (selectedSector && !selectedLogin) {
        document.getElementById("usuario-setor")?.focus();
      } else if (selectedLogin) {
        passwordInputRef.current?.focus();
      } else {
        setError("Digite o setor e selecione uma opção da lista.");
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!selectedSector) {
      setError("Selecione o setor antes de continuar.");
      return;
    }
    if (!selectedLogin) {
      setError("Selecione um usuário deste setor antes de continuar.");
      return;
    }
    if (!password) {
      setError("Digite sua senha.");
      return;
    }
    if (selectedLogin.isShared && !selectedLogin.requesterId) {
      setError("Não foi possível validar a pessoa vinculada ao acesso compartilhado.");
      return;
    }

    setLoading(true);
    let completed = false;

    try {
      const normalizedLogin = selectedLogin.login.trim().toLowerCase();
      let email = "";

      if (normalizedLogin === "admin") {
        email = "admin@pereiro.ce.gov.br";
      } else {
        email = (await resolveLoginEmail(selectedLogin.login)) ?? "";
      }

      if (!email) throw new Error("Usuário ou senha inválidos.");

      if (selectedLogin.isShared && selectedLogin.requesterId) {
        setSelectedSharedRequesterId(selectedLogin.requesterId);
      } else {
        clearSelectedSharedRequesterId();
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw new Error("Usuário ou senha inválidos.");

      const { profile } = await getCurrentUserProfile();
      if (!profile) throw new Error("Não foi possível validar o acesso selecionado.");

      const profileIsShared = isSharedSectorProfile(profile);
      if (profileIsShared !== selectedLogin.isShared) {
        throw new Error("O acesso selecionado não corresponde à conta autenticada.");
      }

      if (profileIsShared) {
        const selectedRequester = await getSelectedSharedRequesterProfile(profile);
        if (!selectedRequester) {
          throw new Error("Não foi possível validar a pessoa vinculada a este posto.");
        }
      }

      completed = true;
      navigate({ to: "/admin" });
    } catch (err) {
      await supabase.auth.signOut();
      clearSelectedSharedRequesterId();
      setError(err instanceof Error ? err.message : "Usuário ou senha inválidos.");
    } finally {
      if (!completed) setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="flex flex-col items-center gap-3 text-emerald-700">
          <Loader2 className="h-10 w-10 animate-spin" />
          <p className="text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-8 text-slate-900">
      <main className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 text-center">
          <h1 className="text-xl font-semibold tracking-normal text-slate-950">Almoxarifado</h1>
          <p className="mt-1 text-sm text-slate-500">Acesse o painel de solicitações</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="nome" className="text-slate-700">
              Usuário
            </Label>
            <div className="relative">
              <Input
                id="nome"
                type="text"
                autoComplete="off"
                placeholder="Usuário"
                className="h-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-600"
                value={loginQuery}
                onChange={(event) => handleLoginQueryChange(event.target.value)}
                onFocus={() => {
                  if (!selectedSector && loginQuery.trim().length >= MIN_LOGIN_QUERY_LENGTH) {
                    setOptionsOpen(true);
                  }
                }}
                onBlur={() => window.setTimeout(() => setOptionsOpen(false), 120)}
                onKeyDown={handleLoginKeyDown}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={optionsOpen && !selectedSector}
                aria-controls={optionsOpen && !selectedSector ? "sector-options" : undefined}
                aria-activedescendant={
                  optionsOpen && !selectedSector && activeOptionIndex >= 0
                    ? `sector-option-${activeOptionIndex}`
                    : undefined
                }
                required
                disabled={loading}
              />

              {optionsOpen &&
                !selectedSector &&
                loginQuery.trim().length >= MIN_LOGIN_QUERY_LENGTH && (
                  <div
                    id="sector-options"
                    role="listbox"
                    className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                  >
                    {searching && (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Buscando setores...
                      </div>
                    )}
                    {!searching && lookupError && (
                      <p className="px-3 py-2 text-sm text-rose-700">{lookupError}</p>
                    )}
                    {!searching && !lookupError && sectorOptions.length === 0 && (
                      <p className="px-3 py-2 text-sm text-slate-500">Nenhum setor encontrado.</p>
                    )}
                    {!searching &&
                      !lookupError &&
                      sectorOptions.map((sector, index) => (
                        <button
                          id={`sector-option-${index}`}
                          key={sector.key}
                          type="button"
                          role="option"
                          aria-selected={index === activeOptionIndex}
                          className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                            index === activeOptionIndex
                              ? "bg-emerald-50 text-emerald-900"
                              : "text-slate-700 hover:bg-slate-50"
                          }`}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveOptionIndex(index)}
                          onClick={() => handleChooseSector(sector)}
                        >
                          <span className="block font-medium">{sector.name}</span>
                        </button>
                      ))}
                  </div>
                )}
            </div>
            {!selectedSector && (
              <p className="text-xs text-slate-500">Digite o setor para localizar os usuários.</p>
            )}
          </div>

          {selectedSector && (
            <div className="space-y-2">
              <Label htmlFor="usuario-setor" className="text-slate-700">
                Usuário do setor
              </Label>
              {loadingSectorUsers ? (
                <div className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando usuários do setor...
                </div>
              ) : sectorUsersError ? (
                <p className="text-xs text-rose-700">{sectorUsersError}</p>
              ) : sectorUsers.length > 0 ? (
                <select
                  id="usuario-setor"
                  value={selectedLogin?.id ?? ""}
                  onChange={(event) => {
                    const user = sectorUsers.find((option) => option.id === event.target.value);
                    if (user) handleChooseUser(user);
                  }}
                  className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  required
                  disabled={loading}
                >
                  <option value="">Selecione um usuário</option>
                  {sectorUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.personName}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-slate-500">
                  {selectedSector && !sectorUsersError
                    ? "Nenhum usuário encontrado neste setor."
                    : "Selecione o usuário deste setor."}
                </p>
              )}
            </div>
          )}

          {selectedLogin && (
            <div className="space-y-2">
              <Label htmlFor="senha" className="text-slate-700">
                Digite a senha
              </Label>
              <Input
                ref={passwordInputRef}
                id="senha"
                type="password"
                autoComplete="current-password"
                placeholder="Digite a senha"
                className="h-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-600"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={loading}
              />
            </div>
          )}

          {error && (
            <p className="rounded border border-destructive/20 bg-destructive/5 px-2 py-1 text-center text-xs text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={
              loading ||
              loadingSectorUsers ||
              !selectedSector ||
              !selectedLogin ||
              (selectedLogin.isShared && !selectedLogin.requesterId) ||
              !password
            }
            className="h-10 w-full gap-2 bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-100"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LockKeyhole className="h-4 w-4" />
            )}
            Entrar
          </Button>
        </form>
      </main>
    </div>
  );
}
