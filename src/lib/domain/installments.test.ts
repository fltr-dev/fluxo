import { describe, expect, it } from "vitest"
import { sameInstallmentPurchase, type InstallmentTx } from "./installments"

const base: InstallmentTx = { id: 7, accountId: 1, date: "2026-10-06", amount: -69.99, description: "EC *HARPERCOLLINS", installmentNumber: 7, totalInstallments: 9 }
const parcel = (n: number, extra: Partial<InstallmentTx> = {}): InstallmentTx => ({
  ...base,
  id: n,
  installmentNumber: n,
  date: `2026-${String(3 + n).padStart(2, "0")}-06`,
  ...extra,
})

describe("parcelas da mesma compra", () => {
  it("acha as outras parcelas, uma por mês a partir do mesmo mês de origem", () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => parcel(n))
    expect(sameInstallmentPurchase(base, all).map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6, 8, 9])
  })

  it("aceita parcela número no texto e centavos de arredondamento", () => {
    const r = sameInstallmentPurchase(base, [parcel(1, { description: "EC *HARPERCOLLINS 01/09", amount: -70.03 }), parcel(2, { description: "ec *harpercollins  Parcela 2/9" })])
    expect(r.map((t) => t.id)).toEqual([1, 2])
  })

  it("compra igual feita um mês depois fica de fora, mesmo com a 1ª parcela no dia da 2ª da outra", () => {
    const tx2 = parcel(8)
    const later = parcel(100, { installmentNumber: 7, date: tx2.date })
    expect(sameInstallmentPurchase(tx2, [parcel(7), parcel(9), later]).map((t) => t.id)).toEqual([7, 9])
  })

  it("aceita todas as parcelas com a data da compra", () => {
    expect(sameInstallmentPurchase(base, [parcel(2, { date: "2026-10-06" })]).map((t) => t.id)).toEqual([2])
  })

  it("separa compras diferentes: outra conta, outro valor, outro texto, outro total ou compra igual em outro mês", () => {
    const others = [
      parcel(1, { accountId: 2 }),
      parcel(2, { amount: -59.99 }),
      parcel(3, { description: "OUTRA LOJA" }),
      parcel(4, { totalInstallments: 10 }),
      parcel(5, { date: "2026-09-06" }), // mesma loja, comprada um mês depois
      parcel(6, { amount: 69.99 }), // estorno
    ]
    expect(sameInstallmentPurchase(base, others)).toEqual([])
  })

  it("transação à vista não tem parcelas", () => {
    expect(sameInstallmentPurchase({ ...base, installmentNumber: null, totalInstallments: null }, [parcel(1)])).toEqual([])
  })
})
