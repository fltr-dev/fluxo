import { z } from "zod"

// Validação de FormData nas Server Actions (fronteira de confiança)
const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v)

export const fd = {
  id: z.coerce.number().int().positive(),
  optId: z.preprocess(blankToNull, z.coerce.number().int().positive().nullable()),
  money: z.coerce.number().finite(),
  optMoney: z.preprocess(blankToNull, z.coerce.number().finite().nullable()),
  text: z.string().trim().min(1).max(200),
  optText: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(1000).nullable()),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
}

export const parseForm = <T extends z.ZodRawShape>(form: FormData, shape: T) => z.object(shape).parse(Object.fromEntries(form))
