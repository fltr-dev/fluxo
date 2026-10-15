import { setCookie } from "./cookies-client"
import { primaryCss, type PrimaryId, type ThemeId } from "./theme"

// Aplica a aparência na hora (sem recarregar) e a guarda em cookie para o servidor renderizar já certa.

export function applyTheme(id: ThemeId) {
  const html = document.documentElement
  html.classList.remove("dark", "light", "dim")
  if (id !== "system") html.classList.add(id)
  setCookie("theme", id === "system" ? null : id)
}

/** O mesmo <style id="app-primary"> que o servidor escreve no <head>; criado aqui se ainda não existir. */
export function applyPrimary(id: PrimaryId) {
  let el = document.getElementById("app-primary")
  if (!el) {
    el = document.createElement("style")
    el.id = "app-primary"
    document.head.appendChild(el)
  }
  el.textContent = primaryCss(id)
  setCookie("primary", id)
}

/** O fundo atual é escuro? (classe explícita ou, sem ela, o tema do sistema) */
export function isDark() {
  const c = document.documentElement.classList
  return c.contains("dark") || c.contains("dim") || (!c.contains("light") && matchMedia("(prefers-color-scheme: dark)").matches)
}
