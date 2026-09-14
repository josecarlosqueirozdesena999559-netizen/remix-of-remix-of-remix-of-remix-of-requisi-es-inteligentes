const USER_APP_MODE_KEY = "solicite:user-app-mode";

export function enableUserAppMode() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_APP_MODE_KEY, "1");
}

export function disableUserAppMode() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_APP_MODE_KEY);
}

export function isUserAppModeEnabled() {
  if (typeof window === "undefined") return false;

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get("app") === "usuario") {
    enableUserAppMode();
    return true;
  }

  return window.localStorage.getItem(USER_APP_MODE_KEY) === "1";
}