import { describe, expect, it } from "vitest"
import { isoFromBR, maskDateBR, parseMoney } from "./format"

describe("parseMoney", () => {
  it("tira moeda e texto e entende o separador decimal", () => {
    expect(parseMoney("R$ 1.234,56")).toBe(1234.56)
    expect(parseMoney("R$ 250,00")).toBe(250)
    expect(parseMoney("1,234.56")).toBe(1234.56)
    expect(parseMoney("12.5")).toBe(12.5)
    expect(parseMoney("1.234")).toBe(1234)
    expect(parseMoney("Valor: 80 reais")).toBe(80)
    expect(parseMoney("abc")).toBe(0)
  })
})

describe("datas dd/mm/aaaa", () => {
  it("mascara enquanto digita", () => {
    expect(maskDateBR("0503")).toBe("05/03")
    expect(maskDateBR("05/03/2026x9")).toBe("05/03/2026")
    expect(maskDateBR("")).toBe("")
  })
  it("converte para ISO só datas completas e reais", () => {
    expect(isoFromBR("05/03/2026")).toBe("2026-03-05")
    expect(isoFromBR("29/02/2028")).toBe("2028-02-29")
    expect(isoFromBR("31/02/2026")).toBeNull()
    expect(isoFromBR("05/03/26")).toBeNull()
  })
})
