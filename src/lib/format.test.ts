import { describe, expect, it } from "vitest"
import { parseMoney } from "./format"

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
