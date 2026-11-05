import { and, eq, isNull, sql } from "drizzle-orm"
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"
import { appState, categories, pluggyCategoryMap } from "./schema"
import type * as schema from "./schema"
import { SEED_CATEGORIES, SEED_PLUGGY_MAP } from "./seed-data"

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

/**
 * Cria as categorias padrão e o mapa da Pluggy. Devolve os ids por caminho: "Categoria" e "Categoria/Subcategoria".
 * Chamar dentro de uma transação para não deixar o conjunto pela metade.
 */
export async function seedCategories(db: Db) {
  const ids = new Map<string, number>()
  for (const c of SEED_CATEGORIES) {
    const [p] = await db.insert(categories).values({ name: c.name, kind: c.kind, color: c.color, icon: c.icon }).returning({ id: categories.id })
    ids.set(c.name, p.id)
    const subs = await db
      .insert(categories)
      .values(c.subs.map((name) => ({ name, kind: c.kind, color: c.color, parentId: p.id })))
      .returning({ id: categories.id, name: categories.name })
    for (const s of subs) ids.set(`${c.name}/${s.name}`, s.id)
  }
  await db
    .insert(pluggyCategoryMap)
    .values(Object.entries(SEED_PLUGGY_MAP).map(([pluggyCategory, path]) => ({ pluggyCategory, subcategoryId: ids.get(path)! })))
  return ids
}

/**
 * Roda uma única vez na vida do banco (na subida do servidor): cria as categorias padrão se não houver nenhuma.
 * Depois disso marca `app_state`, e apagar/arquivar tudo mais tarde não as recria. Instalação que já tem
 * categorias só ganha a marca.
 */
export async function ensureDefaultCategories(db: Db) {
  await db.transaction(async (tx) => {
    await tx.insert(appState).values({ id: 1 }).onConflictDoNothing()
    // O UPDATE trava a linha: duas instâncias subindo juntas não criam o conjunto duas vezes
    const claimed = await tx
      .update(appState)
      .set({ defaultCategoriesAt: new Date() })
      .where(and(eq(appState.id, 1), isNull(appState.defaultCategoriesAt)))
      .returning({ id: appState.id })
    if (!claimed.length) return
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(categories)
    if (count === 0) await seedCategories(tx)
  })
}
