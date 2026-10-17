# fluxo — controle financeiro pessoal

MVP do [SPEC.md](SPEC.md): Next.js 16 + Drizzle + Postgres (Neon) + Auth.js (usuário e senha, sessão JWT) + Pluggy (MeuPluggy) + Jev opcional.

## Rodar localmente

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha (veja abaixo). 
3. `npm run db:migrate`
4. `npm run dev` → entre, vá em **Categorias → Criar categorias padrão**, depois **Contas** para cadastrar conexões ou contas manuais.

Testes (domínio, segurança com SQL injection contra Postgres em memória, aparência/bancos/ícones e login): `npm test`. Também rodam `npm run lint` e `npm run build`.

## Configuração (uma vez)

| Variável | Onde obter |
|---|---|
| `DATABASE_URL` | Neon (free) → connection string *pooled* |
| `AUTH_SECRET` | `npx auth secret` |
| `OWNER_USER` / `OWNER_PASSWORD` | você escolhe; é o único login com acesso aos dados reais (use uma senha longa e aleatória). Valem até você trocar o login em **Configurações › Conta** (veja abaixo) |
| `DEMO_USER` / `DEMO_PASSWORD` | opcional: login de demonstração para outras pessoas (dados fictícios fixos, somente leitura, sem banco extra e sem acesso aos seus dados) |
| `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` | dashboard.pluggy.ai → aplicação com o conector **MeuPluggy** ativo |
| `CRON_SECRET` | qualquer string aleatória longa; a Vercel envia no header do cron |
| `AI_GATEWAY_API_KEY` ou `TYPESAFE_API_KEY` | opcional (Vercel → AI Gateway → API Keys, ou console da TypeSafe); sem elas a classificação por IA fica desligada |

Open Finance: conecte seus bancos em meu.pluggy.ai, copie o **Item ID** de cada conexão e cadastre em **Contas**.

## Telas e recursos de interface

- **Sidebar**: o item ativo é destacado só pela cor de fundo. Dá para **recolher** (botão no topo ou `Ctrl/⌘ + B`) e ficar só com os ícones, com *tooltip* em cada um; a escolha fica num cookie e vale já na primeira renderização. No rodapé aparecem o usuário e a **versão** do sistema (do `package.json`; para publicar uma nova, `npm version minor`). No celular, o mesmo menu abre em "Mais".
- **Contas** é um item com **subitens**: cada conta ativa (recolhível/expansível quando existe alguma). Clicar em *Contas* abre o **resumo geral** (patrimônio, disponível, investido, cartões, conexões e histórico de sincronização); clicar numa conta abre `/contas/[id]`, com saldo, receitas/despesas do mês, evolução do saldo, detalhes e o **histórico de transações** (período, busca e paginação; cada linha abre o detalhe em Transações). `/conexoes` redireciona para `/contas`.
- **Aparência da conta**: em *Editar conta* dá para mudar o **apelido**, escolher o **banco** e a **cor**. Bancos conhecidos (Nubank, Itaú, Inter, Bradesco, Santander, Banco do Brasil, Caixa, C6, BTG, XP, Mercado Pago, PicPay, PagBank, Sicredi, Sicoob, Will Bank, Original) são **detectados** pelo nome da conexão/conta e já vêm com a cor e a logo em SVG; a cor própria vale sobre a do banco. O registro fica em `src/lib/banks.ts` (os logos de Nubank, Mercado Pago, PicPay e PagBank vêm do [simple-icons](https://simpleicons.org), CC0; os demais são monogramas simplificados: para usar o logotipo oficial, troque o `mark` do banco por um `path` SVG). Marcas e logotipos pertencem aos seus donos.
- **Investimentos** (`/investimentos`): a carteira da corretora (pela Pluggy) mais o que você lança à mão (cripto, corretora sem Open Finance). Abas **Resumo** (patrimônio, aplicado, lucro, rentabilidade e % do CDI, proventos; evolução em R$ ou em % contra CDI/IBOV/IPCA; alocação por categoria e **atual × alvo** com quanto aportar; rentabilidade mês a mês; destaques), **Ativos** (tabela por categoria com preço médio, cotação, saldo e rentabilidade; CSV) e **Proventos** (por mês, por ativo, yield on cost, a receber). Cada ativo tem página própria com evolução, resultado, movimentações e proventos. Categorias: Pós-fixado, Pré-fixado, Inflação, Ações, FII, BDR, ETF, Cripto, Fundos e Outros (detectadas; dá para trocar). CDI e IPCA vêm do Banco Central e IBOV e cotações dos ativos manuais do Yahoo Finance, na sincronização diária ou no botão *Cotações*, sem chave de API. Proventos que caem na conta da corretora com o ticker na descrição (ex.: "RENDIMENTO MXRF11") entram sozinhos. A rentabilidade usa os saldos registrados a cada sync, então o histórico começa a contar na primeira sincronização com esta versão. Regras em `SPEC.md` §6.11.
- **Calendário** (`/calendario`): grade do mês com quanto foi **recebido** e **gasto** em cada dia (sem transferências e sem transações ignoradas), resumo do mês, navegação por mês, filtro por **conta** e por **várias categorias** de uma vez (marcar a categoria inclui as subcategorias; também dá para marcar só algumas). Clicar num dia abre as transações dele. O estado vive na URL (`mes`, `dia`, `conta`, `categorias`).
- **Categorias**: nome, **cor** e **ícone** (qualquer ícone do [Lucide](https://lucide.dev), com busca em português e inglês e uma lista de sugeridos), com **pré-visualização** da combinação ícone + cor, como aparece nas listas e na dashboard. A lista completa de ícones só é baixada quando o seletor abre.
- **Seletores próprios**: nenhum `<select>` nem `<input type="color">` do navegador (a lista e a janela de cores do sistema operacional fogem do tema). `FormSelect`/`SubcategorySelect` (`src/components/form-select.tsx`, sobre o Select do Base UI) e `ColorPicker` (paleta, área de saturação/brilho, matiz e hexadecimal) continuam funcionando em formulários com Server Actions, por inputs ocultos.
- **Configurações** (menu do perfil › *Configurações*, também no menu do celular): modal com barra lateral de seções.
  - **Aparência**: **Fundo** (Sistema, Claro, Cinza, Preto) e **Cor de destaque** (9 cores prontas: verde, turquesa, azul, índigo, roxo, amarelo, laranja, vermelho, rosa), só por escolha entre opções, sem seletor livre. Valem por aparelho: ficam em cookies (`theme`, `primary`) e o servidor já renderiza o tema certo, sem piscar. O botão sol/lua do topo alterna claro ↔ escuro.
  - **Conta**: alterar **usuário** e **senha** (exige a senha atual). Ficam no banco (`app_credentials`, senha só como hash scrypt) e passam a valer no lugar de `OWNER_USER`/`OWNER_PASSWORD`; todas as sessões abertas (inclusive a atual) são encerradas e é preciso entrar de novo. Para recuperar o acesso, apague a linha de `app_credentials` (voltam a valer as variáveis de ambiente). Se o banco estiver indisponível, o login do dono também fica indisponível (falha fechada, nunca cai nas variáveis de ambiente). Na demonstração a seção é somente leitura.
  - **Sobre**: versão do sistema e a empresa desenvolvedora, **FLTR Sistemas** (também no rodapé do modal).
- **Sair** aparece na cor *destructive*.
- Na tela de transações, na dashboard e nas regras, a classificação automática por IA aparece como "IA" (o nome interno do provedor não aparece para o usuário).

## PWA, favicon e ícones

O sistema é **instalável** na tela inicial (Android, iOS e desktop): `src/app/manifest.ts` (`/manifest.webmanifest`, `display: standalone`, atalhos "Nova transação" e "Calendário"), ícone vetorial `src/app/icon.svg`, `src/app/favicon.ico` (16/32/48 px), `src/app/apple-icon.png` (iOS) e `public/icons/` (192, 512 e 512 *maskable* para o Android). A barra do navegador acompanha o fundo escolhido (`theme-color`) e a barra inferior respeita a área segura do iPhone. Esses arquivos ficam fora da proteção de login (o navegador os busca antes de entrar; ver `src/proxy.ts`). **Não há modo offline**: os dados vêm sempre do servidor.

Para mudar o desenho, edite `src/app/icon.svg` (e as variações em `public/icons/*.svg`) e rode `node scripts/generate-icons.mjs` (usa o `sharp`, que já vem com o Next) para regenerar os PNGs e o `.ico`.

## Deploy (Vercel Hobby)

1. Importe o repositório na Vercel e configure as variáveis acima.
2. Rode `npm run db:migrate` apontando para o Neon (localmente, com o `DATABASE_URL` de produção).
3. O cron diário está em `vercel.json` (09:00 UTC = 06:00 em Brasília).


## Estrutura

- `src/lib/domain/` — regras de negócio puras (datas, categorização, transferências, merge da sync, cálculos, investimentos) + `domain.test.ts`, `investments.test.ts`
- `src/lib/investments.ts` (consultas da tela de Investimentos: posição, histórico e rentabilidade, proventos, alocação) e `market.ts` (CDI/IPCA do BCB, IBOV e cotações do Yahoo) + `investments.test.ts` (Postgres em memória, Pluggy simulada)
- `src/lib/color.ts`, `theme.ts` (fundos e cores de destaque), `banks.ts` (bancos: cor, logo, detecção), `icon-catalog.ts` (ícones sugeridos), `credentials.ts` (hash scrypt e login do dono), `app-info.ts` (nome, versão e empresa) + `appearance.test.ts`, `credentials.test.ts`
- `src/components/` — `sidebar.tsx`, `settings-dialog.tsx`, `form-select.tsx`, `color-picker.tsx`, `icon-picker.tsx`, `account-avatar.tsx`, `calendar-filters.tsx` e `ui/` (shadcn sobre o Base UI: `select`, `popover`, `tooltip`, `dialog`…)
- `src/lib/sync.ts` — sincronização Pluggy (incremental, retomável por conta), `ledger.ts` (pipeline de categorização, transferências, saldos), `queries.ts` (dashboard/listas), `jev.ts` (cliente Jev isolado)
- `src/app/(app)/*` — telas; cada uma com seu `actions.ts` (Server Actions validadas com Zod e protegidas por `requireUser`)
- `src/db/schema.ts` — schema Drizzle; migrações em `drizzle/`

## Desvios conscientes do SPEC

- "A categorizar" é `subcategory_id = null` (em vez de uma categoria de sistema); transferências também ficam sem categoria.
- Exemplos para o Jev vêm das transações categorizadas pelo usuário (sem tabela `categorization_examples`).
- Vínculo manual de transferência é "marcar/desmarcar como transferência" por transação; o pareamento é automático.
- Filtros de conta e categoria na dashboard são de seleção única; o calendário aceita várias categorias.
- Trocar login/senha encerra as outras sessões sem tabela de sessões: o JWT leva a "versão" do login (instante da última troca) e o layout e as Server Actions a comparam com a linha de `app_credentials` (uma consulta pequena por requisição, só para o dono; o proxy continua sem tocar no banco).
- Aparência (fundo e cor de destaque) é por aparelho, em cookie, e não por usuário no banco.
