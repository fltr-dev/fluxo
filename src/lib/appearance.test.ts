import { existsSync } from "node:fs"
import { join } from "node:path"
import { icons } from "lucide-react"
import { describe, expect, it } from "vitest"
import { accountLook, BANKS, detectBank } from "./banks"
import { contrast, hexToHsv, hsvToHex, mix, normalizeHex, readableOn } from "./color"
import { CATALOG_NAMES, ICON_CATALOG, spaced } from "./icon-catalog"
import { PRIMARIES, primaryCss, primaryFromCookie, THEMES, themeFromCookie } from "./theme"

describe("cores", () => {
  it("normaliza hexadecimais e rejeita o resto", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc")
    expect(normalizeHex("0ea5e9")).toBe("#0ea5e9")
    expect(normalizeHex(" #0EA5E9 ")).toBe("#0ea5e9")
    for (const bad of ["", "#12", "#12345", "#gggggg", "red", "#1234567", "javascript:alert(1)"]) expect(normalizeHex(bad)).toBeNull()
  })
  it("converte hex ↔ HSV sem perder a cor", () => {
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#0ea5e9", "#8b5cf6", "#000000", "#ffffff", "#64748b"]) expect(hsvToHex(hexToHsv(hex))).toBe(hex)
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 })
  })
  it("calcula contraste WCAG e escolhe o texto legível", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0)
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5)
    expect(readableOn("#047857")).toBe("#ffffff")
    expect(readableOn("#fae128")).toBe("#09090b")
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080")
  })
})

describe("tema", () => {
  it("só aceita ids conhecidos vindos do cookie", () => {
    expect(themeFromCookie("dim")).toBe("dim")
    expect(themeFromCookie("dark")).toBe("dark")
    for (const bad of [undefined, "", "system", "blue", "dark; background:url(x)"]) expect(themeFromCookie(bad)).toBe("system")
    expect(THEMES.map((t) => t.id)).toEqual(["system", "light", "dim", "dark"])
    expect(primaryFromCookie("indigo")).toBe("indigo")
    for (const bad of [undefined, "", "#ff0000", "</style><script>", "Indigo"]) expect(primaryFromCookie(bad)).toBeNull()
  })
  it("cada cor de destaque tem contraste AA com o texto nos dois fundos", () => {
    expect(PRIMARIES).toHaveLength(9)
    for (const p of PRIMARIES) {
      expect(contrast(p.light, readableOn(p.light)), `${p.id} claro`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.vivid, readableOn(p.vivid)), `${p.id} escuro`).toBeGreaterThanOrEqual(4.5)
      // no tema claro o destaque também precisa se destacar do fundo branco (links, anéis)
      expect(contrast(p.light, "#ffffff"), `${p.id} sobre branco`).toBeGreaterThanOrEqual(4.5)
      // e, no escuro, do fundo quase preto (elemento de interface: 3:1; texto e fundo de botão juntos não chegam a 4,5 nos dois lados)
      expect(contrast(p.vivid, "#09090b"), `${p.id} sobre preto`).toBeGreaterThanOrEqual(3)
    }
  })
  it("gera CSS só para ids válidos e cobre claro, escuro, cinza e sistema escuro", () => {
    expect(primaryCss(null)).toBe("")
    const css = primaryCss("indigo")
    expect(css).toContain("html:root{--primary:#4338ca")
    expect(css).toContain("html:root.dark,html:root.dim{--primary:#5f62ee")
    expect(css).toContain("@media (prefers-color-scheme:dark){html:root:not(.light):not(.dim){--primary:#5f62ee")
    expect(css).not.toMatch(/[<>]/)
  })
})

describe("bancos", () => {
  it("detecta o banco pelo nome da instituição ou da conta", () => {
    const cases: [string, string][] = [
      ["Nubank", "nubank"],
      ["Nu Pagamentos S.A.", "nubank"],
      ["Itaú", "itau"],
      ["ITAU UNIBANCO", "itau"],
      ["Banco Inter", "inter"],
      ["Bradesco", "bradesco"],
      ["Banco do Brasil", "bb"],
      ["BB", "bb"],
      ["Santander", "santander"],
      ["Caixa Econômica Federal", "caixa"],
      ["C6 Bank", "c6"],
      ["BTG Pactual", "btg"],
      ["Mercado Pago", "mercadopago"],
      ["PicPay", "picpay"],
      ["PagBank", "pagbank"],
      ["Banco Inter S.A.", "inter"],
      ["Inter&Co", "inter"],
      ["Cartão Inter Gold", "inter"],
      ["Itaucard", "itau"],
      ["CEF", "caixa"],
      ["Nu Invest", "nubank"],
      ["PagSeguro Internet S.A.", "pagbank"],
    ]
    for (const [name, key] of cases) expect(detectBank(name)?.key, name).toBe(key)
    // sem falso positivo em apelidos comuns
    for (const none of ["Carteira", "Caixinha Reserva", "Conta Corrente (1234)", "Internet", "CDB 110% CDI", "Poupança", "Caixa", "Caixa da loja", "Intercâmbio"]) expect(detectBank(none), none).toBeUndefined()
    // instituição vence o apelido
    expect(detectBank("Itaú", "Nubank Mastercard")?.key).toBe("itau")
    expect(detectBank(null, "Nubank Mastercard (5678)")?.key).toBe("nubank")
  })
  it("aparência: cor escolhida > cor do banco > cor estável; bank=none ignora a detecção", () => {
    expect(accountLook({ name: "Conta", institution: "Nubank" })).toMatchObject({ bankKey: "nubank", color: "#820ad1", custom: false })
    expect(accountLook({ name: "Conta", institution: "Nubank", color: "#112233" })).toMatchObject({ bankKey: "nubank", color: "#112233", custom: true, fg: "#ffffff" })
    expect(accountLook({ name: "Conta", institution: "Nubank", bank: "none" }).bankKey).toBeUndefined()
    expect(accountLook({ name: "Conta", institution: "Nubank", bank: "inter" })).toMatchObject({ bankKey: "inter", color: "#ff7a00" })
    const a = accountLook({ name: "Carteira" })
    expect(a.bankKey).toBeUndefined()
    expect(a.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(accountLook({ name: "Carteira" }).color).toBe(a.color) // estável
    expect(accountLook({ name: "Carteira", color: "not-a-color" }).custom).toBe(false) // cor inválida é ignorada
    expect(accountLook({ name: "Minha Conta" }).initials).toBe("MC")
    // vai do servidor ao cliente: tem de ser serializável (sem RegExp)
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
  })
  it("todo banco tem cor, texto legível e logo (SVG em public/banks ou monograma de até 3 letras)", () => {
    expect(new Set(BANKS.map((b) => b.key)).size).toBe(BANKS.length)
    for (const b of BANKS) {
      expect(b.color, b.key).toMatch(/^#[0-9a-f]{6}$/)
      // o texto em `fg` (monograma, cartão) segue a marca (ex.: branco sobre o laranja do Inter, 2,6:1); só impede texto "sumido"
      expect(contrast(b.color, b.fg), b.key).toBeGreaterThanOrEqual(2)
      if ("src" in b.mark) expect(existsSync(join("public", b.mark.src)), b.key).toBe(true)
      else expect(b.mark.text, b.key).toMatch(/^.{1,3}$/)
    }
  })
})

describe("catálogo de ícones", () => {
  it("todo ícone sugerido existe na versão instalada do lucide-react", () => {
    const set = icons as Record<string, unknown>
    expect(CATALOG_NAMES.filter((n) => !set[n])).toEqual([])
    expect(new Set(CATALOG_NAMES).size).toBe(CATALOG_NAMES.length)
  })
  it("palavras-chave em português sem acento, para a busca", () => {
    for (const [name, kw] of ICON_CATALOG) expect(kw, name).toMatch(/^[a-z0-9 -]+$/)
    expect(spaced("CircleDollarSign")).toBe("circle dollar sign")
    expect(Object.keys(icons).length).toBeGreaterThan(1000)
  })
})
