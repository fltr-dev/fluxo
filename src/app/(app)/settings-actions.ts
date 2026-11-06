"use server"

import { refresh } from "next/cache"
import { z } from "zod"
import { requireUser, signOut } from "@/auth"
import { db } from "@/db"
import { checkOwner, readOwnerName, saveOwnerName, saveStored, same } from "@/lib/credentials"

export type CredentialsState = { error: string } | { ok: string } | null

const form = z.object({
  name: z.string().trim().max(60, "O nome pode ter no máximo 60 caracteres").default(""),
  username: z.string().trim().min(3, "O usuário precisa ter pelo menos 3 caracteres").max(64, "O usuário pode ter no máximo 64 caracteres"),
  currentPassword: z.string().default(""),
  newPassword: z.string().max(200, "A senha pode ter no máximo 200 caracteres").optional(),
  confirmPassword: z.string().optional(),
})

/**
 * Configurações › Conta: nome de exibição, usuário de entrada e senha do dono. Trocar só o nome salva na hora,
 * sem senha e sem sair. Trocar usuário ou senha exige a senha atual; aí o login passa a valer só pelo banco e
 * todas as sessões abertas (inclusive esta) são encerradas: é preciso entrar de novo.
 */
export async function updateCredentials(_prev: CredentialsState, data: FormData): Promise<CredentialsState> {
  const user = await requireUser()
  const parsed = form.safeParse(Object.fromEntries(data))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { name, username, currentPassword } = parsed.data
  const newPassword = parsed.data.newPassword || null

  const nameChanged = name !== ((await readOwnerName(db)) ?? "")
  const loginChanged = username !== user.email || !!newPassword
  if (!nameChanged && !loginChanged) return { error: "Nada para alterar: mude o nome, o usuário ou a senha" }

  if (loginChanged) {
    if (!currentPassword) return { error: "Informe a senha atual para trocar o usuário ou a senha" }
    if ((await checkOwner(db, user.email, currentPassword)) === null) return { error: "Senha atual incorreta" }
    if (newPassword) {
      if (newPassword.length < 8) return { error: "A nova senha precisa ter pelo menos 8 caracteres" }
      if (newPassword !== parsed.data.confirmPassword) return { error: "A confirmação não confere com a nova senha" }
    }
    const demo = process.env.DEMO_USER
    if (demo && same(username, demo)) return { error: "Esse usuário já é usado pela demonstração" }
  }

  if (nameChanged) await saveOwnerName(db, name)
  if (!loginChanged) {
    refresh()
    return { ok: "Nome salvo" }
  }
  await saveStored(db, { username, password: newPassword ?? currentPassword })
  await signOut({ redirectTo: "/login?alterado=1" })
  return null
}
