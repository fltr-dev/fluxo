# fluxo — Design System

Controle financeiro pessoal, **por FLTR Sistemas**. Este arquivo é a fonte de verdade para gerar telas (Claude Design, protótipos) e para mudar o código. A página visual com tudo renderizado fica no artifact "Fluxo Design System".

> Estado: **aplicado no código**. Os tokens abaixo são os do `src/app/globals.css` (nomes do shadcn), a fonte vem de `src/app/layout.tsx`, o logo de `src/components/logo.tsx` e os ícones de `src/app/icon.svg` e `public/icons/*.svg` (os PNG e o `favicon.ico` são gerados a partir desses SVG). O nome vem de `src/lib/app-info.ts`.

## Princípios

1. **Calma e precisa.** Parece um extrato bem desenhado: neutros zinc, muito respiro, nada piscando.
2. **Números primeiro.** O valor é o elemento mais forte da tela. Sempre `tabular-nums`, alinhado à direita em listas.
3. **Cor só com significado.** Verde-receita, rosa-despesa, âmbar-atenção, vermelho-erro. A cor de destaque (verde fluxo) é para ação e navegação, nunca para dizer "dinheiro entrou".
4. **Celular primeiro.** PWA em retrato: alvos de toque ≥ 44px, barra inferior, ação principal ao alcance do polegar. No desktop, a mesma interface ganha sidebar e mais colunas.
5. **Privacidade.** Todo valor monetário pode ser borrado pelo modo privado (classe `.privacy` + `.tabular-nums`).

## Marca

- **Nome:** fluxo, sempre em minúsculas (inclusive no começo de frase dentro da interface). Vem de "fluxo de caixa", que é o que o app mostra. Assinatura: "por FLTR Sistemas" (rodapé, login, Sobre).
- **Símbolo:** uma moeda vista de frente (anel) com o nível subindo em duas ondas. A onda de trás (45% de opacidade) é o dinheiro que entra; a da frente, cheia, é o que fica guardado. Diz crescimento sem seta nem gráfico de barras.
- **Ícone do app** (favicon, PWA, apple-icon): quadrado arredondado (raio 22% do lado) em `verde-600` com o símbolo branco.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><clipPath id="c"><circle cx="50" cy="50" r="25"/></clipPath></defs>
  <rect width="100" height="100" rx="22" fill="#08845A"/>
  <circle cx="50" cy="50" r="30" fill="none" stroke="#fff" stroke-width="7"/>
  <path clip-path="url(#c)" d="M10 50 C 28 38 42 60 60 46 S 84 34 92 38 V95 H10Z" fill="#fff" fill-opacity=".45"/>
  <path clip-path="url(#c)" d="M10 62 C 28 50 42 74 60 58 S 84 48 92 52 V95 H10Z" fill="#fff"/>
</svg>
```

- **Símbolo solto** (sem o quadrado, herda `currentColor`): o mesmo anel e as mesmas ondas, sem o `rect`, com `stroke-width="6"` e ampliado 1,5× em volta do centro.
- **Wordmark:** "fluxo" em Manrope 800, `letter-spacing: -0.03em`, à direita do ícone com gap de 10px (ícone 32px com texto 20px; ícone 28px com texto 18px).
- **No tema escuro, dentro do app:** o ícone usa o tom vivo `verde-400` com o símbolo em `verde-950`, e o texto em `foreground`. O ícone do app instalado continua verde-600 + branco.
- **Tamanho mínimo:** 16px (favicon). Área de respiro = 25% do lado do ícone.
- **Não fazer:** girar ou inclinar, usar gradiente ou cor fora do destaque, trocar a moeda por cifrão, escrever "Fluxo"/"FLUXO" ou em outra fonte, colocar o ícone sobre fotos.
- **Maskable (Android):** símbolo solto branco dentro do círculo seguro de 80%; fundo `verde-600` sangrando até a borda.

## Cor

### Escala Verde fluxo (marca)

| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| `#EDFAF3` | `#D2F3E2` | `#A6E6C7` | `#6FD3A6` | `#36BC84` | `#12A06A` | `#08845A` | `#08694A` | `#0A533D` | `#0A4433` | `#03261C` |

`600` é o destaque no tema claro (4,7:1 com branco, AA). `400` é o destaque nos temas escuros (8,2:1 sobre zinc-950), com texto `950` por cima.

### Tokens (mesmos nomes do `globals.css`)

| Token | Claro | Preto (escuro) | Uso |
|---|---|---|---|
| `--background` | `#FAFAFA` | `#09090B` | fundo da página |
| `--foreground` | `#09090B` | `#FAFAFA` | texto principal |
| `--card` / `--popover` | `#FFFFFF` | `#18181B` | superfícies |
| `--muted` / `--secondary` / `--accent` | `#F4F4F5` | `#27272A` | fundos sutis, hover |
| `--muted-foreground` | `#71717A` | `#A1A1AA` | texto secundário |
| `--border` | `#E4E4E7` | `#27272A` | divisórias, cards |
| `--input` | `#E4E4E7` | `#3F3F46` | borda de campos |
| `--primary` | `#08845A` | `#36BC84` | ação, item ativo, foco |
| `--primary-foreground` | `#FFFFFF` | `#03261C` | texto sobre primary |
| `--ring` | `#12A06A` | `#36BC84` | anel de foco |
| `--income` | `#15803D` | `#4ADE80` | receitas, variação boa |
| `--expense` | `#E11D48` | `#FB7185` | despesas, variação ruim |
| `--warning` *(novo)* | `#B45309` | `#FBBF24` | limite perto de estourar, pendente |
| `--destructive` | `#DC2626` | `#EF4444` | excluir, sair, erro |
| `--sidebar-accent` | `#EDFAF3` | `#03261C` | fundo do item ativo |
| `--sidebar-accent-foreground` | `#08845A` | `#6FD3A6` | texto do item ativo |

**Fundo Cinza** (`.dim`, escuro mais claro): `--background #232326`, `--card #2C2C30`, `--muted #37373C`, `--muted-foreground #A8A8B0`, `--border #3D3D43`, `--input #55555C`, `--sidebar #1C1C1F`. Demais tokens iguais ao Preto.

**Gráficos** (`--chart-1..5`): claro `#12A06A #0EA5E9 #8B5CF6 #F59E0B #F43F5E`; escuro `#36BC84 #38BDF8 #A78BFA #FBBF24 #FB7185`. Receita × despesa em gráficos usa `--income` e `--expense`, não a série 1..5.

**Categorias de investimento** (`--inv-*`), sempre nesta ordem nos gráficos (a cor segue a categoria, nunca o ranking); validadas para daltonismo em cada tema, com legenda e % escritos ao lado:

| Categoria | Claro | Escuro |
|---|---|---|
| Pós-fixado | `#12A06A` | `#12A06A` |
| Ações | `#0EA5E9` | `#0284C7` |
| FII | `#8B5CF6` | `#8B5CF6` |
| Pré-fixado | `#F59E0B` | `#D97706` |
| Cripto | `#F43F5E` | `#E11D48` |
| Inflação | `#2563EB` | `#3B82F6` |
| BDR | `#CA8A04` | `#A16207` |
| Fundos | `#9333EA` | `#9333EA` |
| ETF | `#EA580C` | `#EA580C` |
| Outros | `#71717A` | `#A1A1AA` |

Nos gráficos de rentabilidade a **carteira** é a linha cheia em `foreground`; os índices (CDI, IBOV, IPCA) ficam em cinza com traços diferentes e o nome escrito, para não competir com as cores das categorias. Ganho/perda do mês usa `--income`/`--expense`.

### Cores de destaque (Configurações › Aparência)

Escolha por aparelho; `light` vale no tema claro, `vivid` nos escuros. Tons suaves (fundo do item ativo, chips) saem de `color-mix(in oklab, var(--primary) 10%, var(--card))`.

| id | Nome | light | vivid |
|---|---|---|---|
| `green` (mantém o id) | **Verde (padrão)** | `#08845A` | `#36BC84` |
| `teal` | Turquesa | `#0F766E` | `#14B8A6` |
| `blue` | Azul | `#1D4ED8` | `#3B82F6` |
| `indigo` | Índigo | `#4338CA` | `#5F62EE` |
| `purple` | Roxo | `#7E22CE` | `#A855F7` |
| `yellow` | Amarelo | `#A16207` | `#EAB308` |
| `orange` | Laranja | `#C2410C` | `#F97316` |
| `red` | Vermelho | `#B91C1C` | `#EF4444` |
| `pink` | Rosa | `#BE185D` | `#EC4899` |

Telas de referência usam sempre **Verde + Claro**, e conferem o Preto.

## Tipografia

- **Interface:** Manrope (Google Fonts), pesos 400, 500, 600, 700, 800. Fallback: `ui-sans-serif, system-ui, sans-serif`.
- **Mono:** Geist Mono, só para IDs, códigos de conexão, versão e valores em tabelas técnicas.
- **Números:** `font-variant-numeric: tabular-nums` em todo valor, data e porcentagem.
- **Moeda:** `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })` → `R$ 1.234,56`, `-R$ 84,90`. Em listas, receita leva `+` e cor `income`; despesa leva cor `expense`. Porcentagem com sinal usa o menos tipográfico `−`.
- **Datas:** `05/03/2026` em tabelas, `16 out` em listas, `Quinta-feira, 5 de março` em cabeçalhos de dia, `out/26` em eixos.

| Token | Tamanho / linha | Peso | Tracking | Uso |
|---|---|---|---|---|
| `display` | 32 / 38 (desktop 36 / 42) | 700 | −0.02em | saldo principal |
| `h1` | 24 / 30 | 700 | −0.015em | título da página |
| `h2` | 18 / 24 | 600 | −0.01em | título de card/seção |
| `h3` | 15 / 20 | 600 | 0 | título de linha, item de lista |
| `body` | 14 / 20 | 400 | 0 | texto corrido, tabelas |
| `small` | 13 / 18 | 500 | 0 | metadados, legenda de valor |
| `caption` | 12 / 16 | 500 | 0 | eixos, rodapés, badges |
| `overline` | 11 / 14 | 700 | 0.08em, maiúsculas | grupo da sidebar, rótulo de KPI |

Campos de formulário usam **16px no celular** (evita o zoom do iOS) e 14px a partir de `md`.

## Forma

- **Espaço:** escala de 4px (`4 8 12 16 20 24 32 40 48 64`). Gutter lateral 16px no celular, 24px no tablet, 32px no desktop. Gap entre cards 12px no celular, 16px no desktop. Padding interno de card 16px (celular) e 20px (desktop).
- **Raio:** `--radius: 0.625rem` (10px). `sm 6` (badges), `md 8` (inputs, botões pequenos), `lg 10` (botões, campos), `xl 14` (cards), `2xl 18` (sheets, modais, phone), `full` (chips, barras, avatares).
- **Borda × sombra:** cards têm só borda `1px var(--border)` e fundo `card`. Sombra só no que flutua: popover/menu `0 8px 24px -8px rgb(0 0 0 / .18)`, sheet/modal `0 24px 48px -12px rgb(0 0 0 / .28)`.
- **Alvos de toque:** mínimo 44×44px no celular (botão padrão 40px de altura + área extra; ícones-botão 40px). Desktop pode usar 32–36px.
- **Movimento:** 150ms `cubic-bezier(.2,.7,.2,1)` em hover/press; 220ms para sheets e modais; sem animação de entrada em listas. `prefers-reduced-motion`: tudo instantâneo.
- **Foco:** `outline: none` + `box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 35%, transparent)` e borda `ring`.

## Ícones

Lucide, traço 2 (1.75 em tamanhos ≥ 24), tamanhos 16 (inline), 20 (navegação, listas), 24 (vazios). Ícone de categoria sempre num círculo de 40px: fundo `cor 12%` e ícone na cor cheia (modo `soft`), ou fundo cheio com ícone branco em KPIs. Navegação: Dashboard `layout-dashboard` (celular: `house` "Início"), Relatórios `chart-column`, Investimentos `trending-up`, Transações `arrow-left-right`, Calendário `calendar-days`, Limites `gauge`, Metas `target`, Reserva `shield-check`, Categorias `tags`, Regras `list-checks`, Contas `landmark`.

## Componentes

- **Botão:** variantes `default` (primary), `secondary`, `outline`, `ghost`, `destructive` (fundo `destructive 10%`, texto destructive), `link`. Alturas: `sm 32`, `default 36` (desktop) / `40` (celular), `lg 44`. Ícone à esquerda, 16px, gap 6px. Um único botão primário por tela.
- **Campo:** altura 40px, raio 8, borda `input`, fundo `background` (escuro: `input 30%`). Rótulo 13/500 acima, dica 12 `muted-foreground` abaixo, erro 12 `destructive`. Campo de valor: prefixo "R$" em `muted-foreground`, texto alinhado à direita, `inputmode="decimal"`.
- **Select:** sempre o componente próprio (Base UI), nunca `<select>` nativo; lista no popover com check no item escolhido.
- **Card:** borda + fundo `card`, raio 14. Cabeçalho: `h2` à esquerda, ação `ghost sm` à direita.
- **KPI:** overline + valor `display`/`h1` + `Delta` (seta e % em `income`/`expense`, `muted` quando zero).
- **Linha de transação:** círculo da categoria (40) · descrição (`h3`, 1 linha com reticências) + "categoria · conta" (`small`, muted) · valor à direita (`h3` tabular) + data (`caption`). Transferência: valor em `foreground`, sem sinal, ícone `arrow-left-right`. Ignorada: linha com opacidade 55% e badge "Ignorada". Altura mínima 56px; separador `border` entre linhas, sem cards por linha.
- **Barra de progresso:** 8px, `full`, trilho `muted`. Estado `ok` (primary), `warn` ≥ 85% (warning), `over` > 100% (expense, barra cheia + texto "R$ 42,00 acima"). O estado também aparece em texto/badge, nunca só na cor.
- **Badge:** 12/500, raio 6, altura 22. Tons: neutro (`muted`), sucesso (`income 12%`), atenção (`warning 14%`), erro (`expense 12%`), destaque (`primary 12%`).
- **Abas / segmentado:** trilho `muted`, item ativo `card` com borda, 32px (celular 36).
- **Switch:** 20×36, ligado = primary.
- **Avatar de conta:** quadrado raio 10, 36px, cor do banco com a logo/monograma branco (Nubank `#820AD1`, Itaú `#EC7000`, Inter `#FF7A00`, C6 `#242424`...).
- **Estado vazio:** borda tracejada, ícone 24 em quadrado `muted` 44px, título 15/600, texto muted, uma ação.
- **Toast:** canto inferior (celular: acima da barra inferior), fundo `foreground`, texto `background`, 14px, ação em `primary` vivo. "Transação salva", "Desfazer".
- **Sidebar (desktop):** 256px (recolhida 56px). Grupos com overline; item 36px, ícone 20, ativo = fundo `sidebar-accent` + texto `sidebar-accent-foreground` (sem barra lateral). Rodapé: avatar, usuário, versão.
- **Barra inferior (celular):** 64px + safe-area, fundo `background 95%` com blur, 4 itens (Início, Transações, Relatórios, Mais) e o botão central "+" (48×44, raio 12, primary) para nova transação. Ativo = ícone e rótulo em primary.
- **Sheet / modal:** no celular, sheet de baixo com alça, raio 18 no topo; no desktop, modal 480–560px.

## Gestos (`SwipeRow`, `src/components/swipe-row.tsx`)

- **Arrastar para o lado** (só no toque) revela botões atrás do item; nada executa sozinho. Botões com 76px de largura e a altura do item: ícone 20 + rótulo 12/500. Arrastar além de 60% da largura executa o botão da borda, exceto os que pedem confirmação. Só um item aberto por vez; tocar fora ou no item fecha.
- **Cores dos botões:** ação principal `primary`; editar/ignorar `zinc-500` com texto branco; arquivar `amber-400` com texto `amber-950`; excluir `destructive` com texto branco.
- **Pressionar e segurar** (450 ms, vibração de 10 ms no Android) ou **clique direito** no desktop abre o painel de ações: sheet de baixo no celular (alça, raio 18 no topo, safe-area), painel lateral de 384px no desktop. Cabeçalho com nome e resumo do item (valor · data · conta); itens de 48px com ícone 20; ações destrutivas em `destructive`.
- **Confirmação:** excluir e arquivar sem volta pedem um segundo toque; o botão troca o texto ("Confirmar", "Toque de novo para excluir") por 3 s.
- **Erro:** a mensagem aparece no topo do painel, em `destructive 10%` ("Não deu para concluir. Tente de novo." ou o aviso de demonstração somente leitura).

| Tela | Arrastar → (direita) | ← Arrastar (esquerda) | Painel |
|---|---|---|---|
| Transações, detalhe da conta, dashboard | Categorizar · com sugestão da IA: Aceitar, Categoria | Ignorar/Considerar · Excluir (só manuais) | categoria, aceitar/rejeitar sugestão, ignorar, transferência, criar regra, detalhes e nota, excluir |
| Metas | Aportar (aportes manuais) | Editar · Arquivar | novo aporte, editar, arquivar |
| Limites | Transações | Editar · Excluir | ver transações, editar, excluir |
| Categorias | Transações | Editar · Arquivar/Reativar | ver transações, editar, arquivar |

Nas tabelas do desktop (Transações, Limites) não há arrastar; o clique direito na linha abre o mesmo painel.

## Telas de referência

1. **Dashboard:** saudação + mês, card de saldo (display) com "olho" do modo privado, KPIs Receitas/Despesas do mês com Delta, gráfico de barras dos 6 meses (income × expense), limites em atenção, últimas transações.
2. **Transações:** busca + filtros (chips: período, conta, categoria), lista agrupada por dia com total do dia, botão "+" na barra inferior.
3. **Limites / Metas:** abas Limites | Metas; limite por categoria com barra e estado; meta com valor guardado, alvo, prazo e quanto falta por mês.
4. **Login:** ícone + wordmark, "Entrar", usuário, senha (mostrar/ocultar), botão primário largo, link "Ver demonstração", assinatura "por FLTR Sistemas".

## Voz e texto

PT-BR, direto, segunda pessoa implícita. Botões dizem o que fazem ("Salvar transação", "Criar meta"). Erros dizem o que houve e o que fazer ("Senha incorreta. Confira e tente de novo."). Sem exclamações, sem emoji, sem "Ops!".

## Como usar no Claude Design

1. Anexe este `DESIGN.md` (ou conecte o repositório) e a página do Design System como referência visual.
2. Peça telas dizendo: "Use o Design System fluxo do DESIGN.md (nome sempre em minúsculas): Manrope, tokens zinc + verde fluxo, celular primeiro (390px) com barra inferior; mostre também a versão desktop com sidebar".
3. Gere em Claro e confira em Preto. Dados sempre fictícios e realistas em reais.
