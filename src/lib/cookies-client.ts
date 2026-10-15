/** Preferência por aparelho (tema, sidebar…): cookie de 1 ano, que o servidor lê para já renderizar certo. */
export function setCookie(name: string, value: string | null) {
  document.cookie = value === null ? `${name}=; path=/; max-age=0; samesite=lax` : `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}
