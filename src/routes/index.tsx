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
import { resolveLoginEmail, searchLoginOptions, type LoginOption } from "@/lib/login-options";

const MIN_LOGIN_QUERY_LENGTH = 2;

function getLoginOptionLabel(option: LoginOption) {
  return option.isShared ? option.login : option.displayName;
}

type SharedRequesterOption = {
  id: string;
  name: string;
};

type LoginOptionGroup = {
  option: LoginOption;
  requesters: SharedRequesterOption[];
};

function getSharedRequesterName(displayName: string) {
  return displayName.split(" — ").slice(1).join(" — ").trim() || displayName;
}

function groupLoginOptions(options: LoginOption[]): LoginOptionGroup[] {
  const groupedOptions: LoginOptionGroup[] = [];
  const sharedOptionsByLogin = new Map<string, LoginOptionGroup>();

  for (const option of options) {
    if (!option.isShared) {
      groupedOptions.push({ option, requesters: [] });
      continue;
    }

    const key = option.login.trim().toLowerCase();
    let group = sharedOptionsByLogin.get(key);

    if (!group) {
      group = {
        option: { ...option, displayName: option.login, requesterId: null },
        requesters: [],
      };
      sharedOptionsByLogin.set(key, group);
      groupedOptions.push(group);
    }

    if (
      option.requesterId &&
      !group.requesters.some((requester) => requester.id === option.requesterId)
    ) {
      group.requesters.push({
        id: option.requesterId,
        name: getSharedRequesterName(option.displayName),
      });
    }
  }

  return groupedOptions;
}

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [loginQuery, setLoginQuery] = useState("");
  const [password, setPassword] = useState("");
  const [loginOptions, setLoginOptions] = useState<LoginOption[]>([]);
  const [selectedLogin, setSelectedLogin] = useState<LoginOption | null>(null);
  const [sharedRequesterOptions, setSharedRequesterOptions] = useState<SharedRequesterOption[]>([]);
  const [selectedRequesterId, setSelectedRequesterId] = useState("");
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visibleLoginOptions = groupLoginOptions(loginOptions);

  useEffect(() => {
    const query = loginQuery.trim();
    if (selectedLogin) {
      setLoginOptions([]);
      setOptionsOpen(false);
      setSearching(false);
      return;
    }

    if (query.length < MIN_LOGIN_QUERY_LENGTH) {
      setLoginOptions([]);
      setOptionsOpen(false);
      setSearching(false);
      setLookupError(null);
      return;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      setLookupError(null);

      void searchLoginOptions(query)
        .then((options) => {
          if (!active) return;
          setLoginOptions(options);
          setActiveOptionIndex(groupLoginOptions(options).length > 0 ? 0 : -1);
          setOptionsOpen(true);
        })
        .catch(() => {
          if (!active) return;
          setLoginOptions([]);
          setLookupError("Não foi possível carregar a lista de usuários. Tente novamente.");
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
  }, [loginQuery, selectedLogin]);

  const handleLoginQueryChange = (value: string) => {
    setLoginQuery(value);
    setSelectedLogin(null);
    setPassword("");
    setLoginOptions([]);
    setSharedRequesterOptions([]);
    setSelectedRequesterId("");
    setSearching(value.trim().length >= MIN_LOGIN_QUERY_LENGTH);
    setError(null);
    setLookupError(null);
    setActiveOptionIndex(-1);
    setOptionsOpen(value.trim().length >= MIN_LOGIN_QUERY_LENGTH);
    clearSelectedSharedRequesterId();
  };

  const handleChooseLogin = (option: LoginOption, requesters: SharedRequesterOption[] = []) => {
    const selectedOption = option.isShared
      ? { ...option, displayName: option.login, requesterId: null }
      : option;
    const initialRequesterId = option.isShared && requesters.length === 1 ? requesters[0].id : "";

    setSelectedLogin(selectedOption);
    setSharedRequesterOptions(option.isShared ? requesters : []);
    setSelectedRequesterId(initialRequesterId);
    setLoginQuery(getLoginOptionLabel(option));
    setPassword("");
    setError(null);
    setLookupError(null);
    setOptionsOpen(false);
    setActiveOptionIndex(-1);
    if (initialRequesterId) {
      setSelectedSharedRequesterId(initialRequesterId);
    } else {
      clearSelectedSharedRequesterId();
    }

    window.setTimeout(() => {
      if (option.isShared && !initialRequesterId) {
        document.getElementById("pessoa-vinculada")?.focus();
      } else {
        passwordInputRef.current?.focus();
      }
    }, 0);
  };

  const handleSharedRequesterChange = (requesterId: string) => {
    setSelectedRequesterId(requesterId);
    setError(null);

    if (requesterId) {
      setSelectedSharedRequesterId(requesterId);
      window.setTimeout(() => passwordInputRef.current?.focus(), 0);
    } else {
      clearSelectedSharedRequesterId();
    }
  };

  const handleLoginKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && visibleLoginOptions.length > 0) {
      event.preventDefault();
      setOptionsOpen(true);
      setActiveOptionIndex((current) => (current + 1) % visibleLoginOptions.length);
      return;
    }

    if (event.key === "ArrowUp" && visibleLoginOptions.length > 0) {
      event.preventDefault();
      setOptionsOpen(true);
      setActiveOptionIndex((current) =>
        current <= 0 ? visibleLoginOptions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Escape") {
      setOptionsOpen(false);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const activeOption = visibleLoginOptions[activeOptionIndex];
      if (!selectedLogin && activeOption) {
        handleChooseLogin(activeOption.option, activeOption.requesters);
      } else if (selectedLogin?.isShared && !selectedRequesterId) {
        document.getElementById("pessoa-vinculada")?.focus();
      } else if (selectedLogin) {
        passwordInputRef.current?.focus();
      } else {
        setError("Digite seu usuário e selecione uma opção da lista.");
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!selectedLogin) {
      setError("Selecione seu acesso na lista antes de continuar.");
      return;
    }
    if (!password) {
      setError("Digite sua senha.");
      return;
    }
    if (selectedLogin.isShared && !selectedRequesterId) {
      setError("Selecione a pessoa vinculada ao posto antes de entrar.");
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

      if (selectedLogin.isShared && selectedRequesterId) {
        setSelectedSharedRequesterId(selectedRequesterId);
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
                autoComplete="username"
                placeholder="Usuário"
                className="h-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-600"
                value={loginQuery}
                onChange={(event) => handleLoginQueryChange(event.target.value)}
                onFocus={() => {
                  if (!selectedLogin && loginQuery.trim().length >= MIN_LOGIN_QUERY_LENGTH) {
                    setOptionsOpen(true);
                  }
                }}
                onBlur={() => window.setTimeout(() => setOptionsOpen(false), 120)}
                onKeyDown={handleLoginKeyDown}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={optionsOpen && !selectedLogin}
                aria-controls="login-options"
                aria-activedescendant={
                  activeOptionIndex >= 0 ? `login-option-${activeOptionIndex}` : undefined
                }
                required
                disabled={loading}
              />

              {optionsOpen &&
                !selectedLogin &&
                loginQuery.trim().length >= MIN_LOGIN_QUERY_LENGTH && (
                  <div
                    id="login-options"
                    role="listbox"
                    className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                  >
                    {searching && (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Buscando acessos...
                      </div>
                    )}
                    {!searching && lookupError && (
                      <p className="px-3 py-2 text-sm text-rose-700">{lookupError}</p>
                    )}
                    {!searching && !lookupError && loginOptions.length === 0 && (
                      <p className="px-3 py-2 text-sm text-slate-500">Nenhum acesso encontrado.</p>
                    )}
                    {!searching &&
                      !lookupError &&
                      visibleLoginOptions.map(({ option, requesters }, index) => (
                        <button
                          id={`login-option-${index}`}
                          key={`${option.login}-${option.isShared ? "shared" : (option.requesterId ?? "account")}`}
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
                          onClick={() => handleChooseLogin(option, requesters)}
                        >
                          <span className="block font-medium">{getLoginOptionLabel(option)}</span>
                        </button>
                      ))}
                  </div>
                )}
            </div>
            {!selectedLogin && (
              <p className="text-xs text-slate-500">
                Digite o usuário ou setor para localizar o acesso.
              </p>
            )}
          </div>

          {selectedLogin?.isShared && sharedRequesterOptions.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="pessoa-vinculada" className="text-slate-700">
                Pessoa vinculada
              </Label>
              <select
                id="pessoa-vinculada"
                value={selectedRequesterId}
                onChange={(event) => handleSharedRequesterChange(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                required
                disabled={loading}
              >
                <option value="">Selecione a pessoa vinculada</option>
                {sharedRequesterOptions.map((requester) => (
                  <option key={requester.id} value={requester.id}>
                    {requester.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedLogin?.isShared && sharedRequesterOptions.length === 0 && (
            <p className="text-xs text-rose-700">Nenhuma pessoa vinculada a esse acesso.</p>
          )}

          {selectedLogin && (!selectedLogin.isShared || selectedRequesterId) && (
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
              !selectedLogin ||
              (selectedLogin.isShared && !selectedRequesterId) ||
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
