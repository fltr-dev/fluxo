"use server"

import { z } from "zod"
import { requireUser, signOut } from "@/auth"
import { db } from "@/db"
import { checkOwner, saveStored, same } from "@/lib/credentials"

export type CredentialsState = { error: string } | null

const form = z.object({
  username: z.string().trim().min(3, "O usuário precisa ter pelo menos 3 caracteres").max(64, "O usuário pode ter no máximo 64 caracteres"),
  currentPassword: z.string().min(1, "Informe a senha atual"),
  newPassword: z.string().max(200, "A senha pode ter no máximo 200 caracteres").optional(),
  confirmPassword: z.string().optional(),
})

/**
 * Configurações › Conta: troca o usuário e/ou a senha do dono. Exige a senha atual. Ao salvar, o login passa a
 * valer só pelo banco e todas as sessões abertas (inclusive esta) são encerradas: é preciso entrar de novo.
 */
export async function updateCredentials(_prev: CredentialsState, data: FormData): Promise<CredentialsState> {
  const user = await requireUser()
  const parsed = form.safeParse(Object.fromEntries(data))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { username, currentPassword } = parsed.data
  const newPassword = parsed.data.newPassword || null

  if ((await checkOwner(db, user.email, currentPassword)) === null) return { error: "Senha atual incorreta" }
  if (username === user.email && !newPassword) return { error: "Nada para alterar: informe um novo usuário ou uma nova senha" }
  if (newPassword) {
    if (newPassword.length < 8) return { error: "A nova senha precisa ter pelo menos 8 caracteres" }
    if (newPassword !== parsed.data.confirmPassword) return { error: "A confirmação não confere com a nova senha" }
  }
  const demo = process.env.DEMO_USER
  if (demo && same(username, demo)) return { error: "Esse usuário já é usado pela demonstração" }

  await saveStored(db, { username, password: newPassword ?? currentPassword })
  await signOut({ redirectTo: "/login?alterado=1" })
  return null
}
