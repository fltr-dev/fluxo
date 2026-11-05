// Roda uma vez na subida de cada instância do servidor
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  try {
    const { asOwner, db } = await import("@/db")
    const { ensureDefaultCategories } = await import("@/db/default-categories")
    await asOwner(() => ensureDefaultCategories(db))
  } catch (e) {
    // Sem banco (ou sem a migração 0006) o app sobe mesmo assim; o botão em Categorias continua disponível
    console.error("categorias padrão:", e instanceof Error ? e.message : e)
  }
}
