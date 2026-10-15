# SPEC — Sistema de Controle Financeiro Pessoal

> Versão 1.1 · 2026-10-15 · Status: MVP implementado; 1.1 acrescenta sidebar retrátil, contas com detalhe, calendário, configurações e PWA instalável

## 1. Visão geral

Aplicação web responsiva, de uso **estritamente pessoal (um único usuário)**, para controle financeiro. Importa contas e transações bancárias via **Open Finance (Pluggy / conector MeuPluggy, gratuito)**, categoriza receitas e despesas em dois níveis, acompanha **metas**, **limites de gasto** e **reserva de emergência**, e oferece uma **dashboard filtrável** com comparativos entre períodos e categorias.

### Princípios
- **Custo de infraestrutura: R$ 0** (apenas free tiers).
- **Um usuário**: sem multi-tenant, sem cadastro, sem billing.
- **Dados do banco são a fonte da verdade**: valor e data de transações importadas são imutáveis.
- **Edições do usuário nunca são sobrescritas** pela sincronização.
- **Dependências externas opcionais não podem quebrar o fluxo** (ex.: Jev).

## 2. Usuários e escala

| Item | Valor esperado |
|---|---|
| Usuários | 1 (o dono) |
| Instituições conectadas | ~2–6 |
| Transações/mês | ~200–800 |
| Histórico total (5 anos) | < 50 mil transações |
| Acesso | Desktop e celular (navegador) |

Escala trivial: nenhuma otimização além de índices básicos no Postgres.

## 3. Stack e arquitetura

| Camada | Escolha |
|---|---|
| Framework | **Next.js** (App Router, Server Components, Server Actions), TypeScript |
| UI | **Tailwind CSS + shadcn/ui**, layout mobile-first |
| Gráficos | **Recharts** |
| Banco | **Neon Postgres** (free tier, serverless; hiberna quando ocioso, não perde dados) |
| ORM / migrações | **Drizzle ORM** + drizzle-kit |
| Auth | **Auth.js** (usuário e senha, ver §4) com sessão **JWT** |
| Hospedagem | **Vercel Hobby** |
| Jobs | **Vercel Cron** (1x/dia) |
| Open Finance | **Pluggy API** via conector **MeuPluggy** (connector 200) |
| Classificação IA (opcional) | **Jev** (TypeSafe AI), atrás de feature flag |
| Testes | **Vitest** (unitários das regras de negócio) |

```
[Navegador] ──HTTPS──> [Next.js na Vercel]
                          ├── Server Components / Server Actions (UI + mutações)
                          ├── /api/auth/*           (Auth.js, Google OAuth)
                          ├── /api/cron/sync        (Vercel Cron, protegido por CRON_SECRET)
                          ├── Serviço de Sync ──────> [Pluggy API / MeuPluggy]
                          ├── Pipeline de categorização ──(opcional)──> [Jev API]
                          └── Drizzle ──────────────> [Neon Postgres]
```

Monólito único. Sem API pública, sem filas, sem cache dedicado.

## 4. Autenticação e segurança

- **Login**: usuário e senha (Auth.js Credentials), sem cadastro e sem OAuth. Dois papéis definidos por variáveis de ambiente: `owner` (`OWNER_USER`/`OWNER_PASSWORD`, dados reais e escrita) e `demo` (`DEMO_USER`/`DEMO_PASSWORD`, opcional). A demo usa um Postgres embutido em memória (PGlite), populado com dados fictícios fixos (`src/db/demo-seed.ts`), e é somente leitura: `requireUser()` recusa escritas e o acesso ao banco falha fechado (só `owner`, ou o cron, alcança `DATABASE_URL`). O site não é indexável (`robots`).
- **Login do dono editável**: em *Configurações › Conta* o dono troca usuário e senha (exige a senha atual). O login fica na tabela `app_credentials` (linha única; senha como hash **scrypt** com sal próprio) e, existindo, **substitui** `OWNER_USER`/`OWNER_PASSWORD` (que funcionam só como login inicial). A leitura do login salvo falha fechada: erro do banco recusa a entrada, nunca recai nas variáveis de ambiente (tabela ainda não migrada conta como "sem login salvo"). A demonstração não é editável. Ao trocar, as sessões antigas deixam de valer: o token JWT leva a "versão" do login (instante da última troca) e `requireUser()` e o layout das telas a comparam com o banco; o proxy continua sem consultar o banco.
- **Sessão**: estratégia **JWT** do Auth.js. O token fica num cookie criptografado (JWE), `httpOnly`, `secure`, `sameSite=lax`, com validade de 30 dias. Não há tabela de sessões, então o banco não é consultado (nem acordado) a cada request.
- **Proteção de rotas**: middleware exige sessão válida em todas as páginas e Server Actions, exceto `/login`, `/api/auth/*`, `/api/cron/*` (CRON_SECRET), `/robots.txt` e os arquivos do PWA (`/manifest.webmanifest`, `/icon.svg`, `/apple-icon.png`, `/favicon.ico`, `/icons/*`), que o navegador busca antes do login.
- **Cron**: `/api/cron/sync` exige header `Authorization: Bearer ${CRON_SECRET}` (padrão Vercel).
- **Segredos** (somente variáveis de ambiente, nunca no banco nem no cliente):
  `AUTH_SECRET`, `OWNER_USER`, `OWNER_PASSWORD`, `DEMO_USER`, `DEMO_PASSWORD`, `DATABASE_URL`, `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `CRON_SECRET`, `AI_GATEWAY_API_KEY` ou `TYPESAFE_API_KEY` (opcional).
- Chamadas à Pluggy e ao Jev acontecem **apenas no servidor**.
- Validação de entrada (ex.: Zod) em todas as Server Actions.
- **SQL injection**: todo acesso ao banco passa pelo Drizzle, que envia valores como parâmetros (`$1`, `$2`…), nunca concatenados ao SQL. Os trechos `sql\`…\`` usam apenas interpolação `${valor}` (parametrizada); `sql.raw` e concatenação de strings em SQL são proibidos. Parâmetros de URL são normalizados antes de chegar à query (`parseFilters`: inteiros positivos, datas `AAAA-MM-DD`, enums fixos, busca limitada a 100 caracteres). A busca por descrição usa `ilike` parametrizado (`%`/`_` digitados atuam como curinga, sem risco de injeção). Coberto por `src/lib/sql-injection.test.ts`, que roda payloads clássicos (`' OR '1'='1`, `'; DROP TABLE …`, `UNION SELECT`) contra um Postgres real em memória (PGlite) com as migrations do projeto.

## 5. Integração Open Finance (Pluggy / MeuPluggy)

### Setup (uma vez, manual)
1. Criar conta em `meu.pluggy.ai` e conectar os bancos lá (consentimento Open Finance).
2. Criar aplicação em `dashboard.pluggy.ai`, ativar o conector MeuPluggy e obter `CLIENT_ID`/`CLIENT_SECRET`.
3. Na aplicação, abrir o **Demo** ("Ir para Demo"), conectar o conector **MeuPluggy** autorizando com a conta do meu.pluggy.ai e copiar o **Item ID** gerado (menu ⋮ › "Copiar Item ID"). O ID exibido no próprio meu.pluggy.ai pertence a outra aplicação e retorna `ITEM_NOT_FOUND`.
4. No sistema, tela **Conexões**: cadastrar esses **Item IDs**. O sistema lista as contas de cada item e o usuário define apelido e tipo (corrente, cartão, poupança/investimento) e se a conta compõe a **reserva**.

> O conector MeuPluggy é gratuito por tempo indeterminado para dados do **próprio CPF**. Isso inviabiliza multiusuário sem um contrato pago, o que é coerente com o escopo.

### Sincronização
- **Gatilhos**: Vercel Cron diário + botão **"Sincronizar agora"**.
- **Primeira sync** de cada conta: puxa **todo o histórico** que a Pluggy disponibilizar.
- **Syncs seguintes**: janela incremental a partir da última sync, com sobreposição de alguns dias para capturar pendentes que foram confirmadas.
- **Idempotência**: upsert pela chave `pluggy_transaction_id`.
- **Campos do banco** (valor, data, descrição, status, parcelas) são atualizados na sync. **Campos do usuário** (categoria definida manualmente, nota, ignorar) **nunca são sobrescritos**.
- **Pendentes**: entram com `status = PENDING` e selo visual, e contam para limites. Quando confirmadas, a Pluggy entrega o registro definitivo: atualizar o mesmo registro ou remover a pendente órfã, preservando a categoria do usuário quando possível.
- **Saldos**: a cada sync, gravar snapshot de saldo por conta (alimenta a evolução do patrimônio).
- **Erros**: registrar em `sync_runs` (início, fim, status, mensagem). Mostrar na UI a última sync bem-sucedida e o erro, se houver (ex.: consentimento expirado → instruir a renovar no MeuPluggy).
- Respeitar o timeout de funções da Vercel Hobby: sincronizar conta por conta e retomar de onde parou se necessário.

## 6. Regras de domínio

### 6.1 Contas
- Tipos: `CHECKING` (corrente), `CREDIT_CARD`, `SAVINGS_INVESTMENT` (só saldo, sem detalhamento), `CASH` (carteira/manual).
- Origem: `PLUGGY` ou `MANUAL`.
- Flag `is_emergency_reserve`.
- Moeda única: **BRL**.

### 6.2 Transações
- Tipo derivado: `INCOME`, `EXPENSE` ou `TRANSFER`.
- **Importadas**: valor e data são imutáveis. O usuário pode alterar **categoria**, **nota** e **ignorar nos relatórios**.
- **Manuais**: totalmente editáveis e excluíveis.
- Sem divisão (split) de transações no MVP.

### 6.3 Cartão de crédito
- Cada **compra** é a despesa e conta na **data da compra**.
- **Parceladas**: cada **parcela** é uma despesa no mês em que cai na fatura (como a Pluggy entrega). Guardar `installment_number`/`total_installments` para exibição.
- **Pagamento da fatura** na conta corrente vira **transferência** (não conta como despesa, para evitar contagem dupla).

### 6.4 Transferências entre contas próprias
Detecção automática após cada sync:
1. A categoria da Pluggy indica transferência/pagamento de fatura **e** existe a contraparte entre as contas do usuário; **ou**
2. Duas transações de **mesmo valor absoluto e sinais opostos**, em **contas diferentes do usuário**, com **até 3 dias** de diferença.

O par é vinculado (`transfer_pair_id`), marcado como `TRANSFER` e excluído de receita/despesa. O usuário pode desfazer ou criar o vínculo manualmente. Pagamento de fatura sem a contraparte importada também vira `TRANSFER` pela categoria da Pluggy.

### 6.5 Categorias
- **Dois níveis**: Categoria → Subcategoria, cada uma com tipo `INCOME` ou `EXPENSE`.
- Transações são sempre atribuídas a uma **subcategoria**. Os agregados de categoria são a soma das subcategorias.
- **Seed** inicial editável (ex.: Moradia, Alimentação, Transporte, Saúde, Lazer, Educação, Compras, Assinaturas, Impostos/Taxas; Salário, Rendimentos, Outras receitas). O usuário pode criar, renomear, arquivar e mesclar.
- Categoria especial de sistema: **"A categorizar"**.
- Arquivar uma categoria com transações não apaga nada: ela some dos seletores e permanece no histórico.

### 6.6 Pipeline de categorização
Executado para cada transação nova sem categoria definida pelo usuário, nesta ordem:

1. **Regras do usuário**: condições sobre descrição (contém / começa com / regex), conta, faixa de valor e tipo → subcategoria. Prioridade explícita; a primeira que casar vence.
2. **Jev** (se `AI_GATEWAY_API_KEY` ou `TYPESAFE_API_KEY` estiver configurada): envia descrição, valor, conta e categoria da Pluggy como `state`, com uma pergunta `choice` cujos critérios são as subcategorias ativas do tipo correspondente. Recebe subcategoria + probabilidade.
   - confiança ≥ **0,85** (configurável) → aplica, com origem `JEV`.
   - **0,60–0,85** → grava como **sugestão** pendente de confirmação e segue para o passo 3.
   - abaixo disso, erro ou timeout (> 2 s) → ignora e segue.
   - Correções do usuário são guardadas como exemplos rotulados (descrição → subcategoria) para enviar como contexto (`state.examples`).
3. **Mapeamento de categoria Pluggy** → subcategoria do usuário (tabela editável de mapeamento).
4. Senão → **"A categorizar"**.

Cada transação registra `category_source` (`USER`, `RULE`, `JEV`, `PLUGGY_MAP`, `NONE`). Quando o usuário corrige uma categoria, a origem vira `USER` e a UI oferece **"criar regra a partir desta correção"**.

> A integração segue a API SystemOne da TypeSafe (https://docs.typesafe.ai/api), direta ou via AI Gateway da Vercel, e fica isolada num único módulo do servidor (`src/lib/jev.ts`). Privacidade: com a flag ligada, a descrição e o valor das transações saem do sistema.

### 6.7 Limites de gasto
- Valor em R$ **por mês calendário**, por **categoria** ou **subcategoria** (despesas).
- Consumo = soma das despesas do mês (inclui pendentes, exclui transferências e transações ignoradas).
- Estados visuais: normal (< 80%), **atenção (≥ 80%)**, **estourado (≥ 100%)**.
- Sem notificações por e-mail/push no MVP.

### 6.8 Metas
- Campos: nome, valor alvo, prazo (data), valor inicial opcional.
- Progresso medido de uma de duas formas:
  - **Conta vinculada**: progresso = saldo atual da conta (ou soma de contas);
  - **Aportes manuais**: lista de aportes (data, valor, nota).
- Calculado: % atingido, valor restante, meses até o prazo, **aporte mensal necessário** = restante ÷ meses restantes, e situação (no ritmo / atrasada / concluída).

### 6.9 Reserva de emergência
- Saldo = soma dos saldos atuais das contas com `is_emergency_reserve = true`.
- Alvo configurável: **N meses de despesa média** (padrão: 6 meses, média dos últimos 12 meses fechados, excluindo transferências e ignoradas) **ou** valor fixo em R$.
- Indicadores: saldo, alvo, % e **meses de cobertura** = saldo ÷ despesa média mensal.

### 6.10 Período
- "Mês" = **mês calendário** (dia 1 até o último dia) em relatórios, limites e comparativos.
- Fuso: `America/Sao_Paulo` para todos os agrupamentos por data.

## 7. Modelo de dados (conceitual)

```
institutions      id, pluggy_item_id, name, status, last_synced_at
accounts          id, institution_id?, pluggy_account_id?, name, type, source,
                  is_emergency_reserve, archived, created_at,
                  color? (#rrggbb; null = cor do banco), bank? (chave do banco; null = detectar, "none" = nenhum)
balance_snapshots id, account_id, date, balance
categories        id, parent_id?, name, kind(INCOME|EXPENSE), color, icon? (nome do ícone do Lucide),
                  archived, is_system
transactions      id, account_id, pluggy_transaction_id? (unique),
                  date, amount, description, status(POSTED|PENDING),
                  kind(INCOME|EXPENSE|TRANSFER), subcategory_id,
                  category_source, suggested_subcategory_id?, suggestion_confidence?,
                  pluggy_category?, installment_number?, total_installments?,
                  transfer_pair_id?, note?, ignored, created_at, updated_at
category_rules    id, priority, conditions(json), subcategory_id, active
pluggy_category_map pluggy_category, subcategory_id
spending_limits   id, category_id (categoria ou subcategoria), monthly_amount, active
goals             id, name, target_amount, deadline, initial_amount,
                  tracking(ACCOUNT|CONTRIBUTIONS), archived
goal_accounts     goal_id, account_id
goal_contributions id, goal_id, date, amount, note
reserve_settings  target_mode(MONTHS|FIXED), target_months, target_amount
sync_runs         id, trigger(CRON|MANUAL), started_at, finished_at, status, error
app_credentials   id (=1), username, password_hash (scrypt), updated_at
categorization_examples id, description, amount, subcategory_id, created_at
```

Valores monetários em `numeric(14,2)` (nunca float). Índices: `transactions(date)`, `transactions(account_id, date)`, `transactions(subcategory_id, date)`, unique `pluggy_transaction_id`.

## 8. Telas e fluxos principais

1. **Login**: usuário e senha (sem cadastro e sem OAuth); avisa quando o login foi alterado e a sessão antiga caiu.
2. **Dashboard** (home), com filtros globais: **período** (mês atual, mês anterior, últimos 3/6/12 meses, ano atual, ano anterior, intervalo personalizado), **contas**, **categorias/subcategorias** e **tipo** (receita/despesa). Os filtros ficam na URL (compartilháveis e com histórico do navegador).
   - **Patrimônio líquido**: gráfico de área dos últimos 3/6/12 meses (contas + investimentos − fatura aberta dos cartões), a partir dos snapshots.
   - **Resumo**: receitas, despesas, saldo do período (variação vs período anterior) e meses de cobertura da reserva.
   - **Gastos**: maiores categorias (com variação), distribuição por categoria (meio-donut) e receitas x despesas dos últimos 6 meses.
   - **Precisa de atenção** (limites ≥ 80%, transações a categorizar, sugestões do Jev, conexões com erro) e **metas** em andamento.
2a. **Relatórios**, com os mesmos filtros e quatro abas:
   - **Comparativos**: período vs anterior, vs média de 6 meses, vs mesmo período do ano anterior, por categoria.
   - **Evolução**: barras empilhadas mês a mês por categoria e receitas x despesas.
   - **Categorias**: drill-down categoria → subcategoria → lista de transações.
   - **Patrimônio**: evolução do patrimônio líquido e saldo por conta.
3. **Transações**: lista paginada e filtrável (mesmos filtros + busca por texto + "a categorizar" + "sugestões do Jev"). Edição inline de categoria; nota; ignorar; confirmar/rejeitar sugestão; criar regra a partir da correção; vincular/desvincular transferência; **exportar CSV** do resultado filtrado. Criar/editar/excluir transação manual.
4. **Categorias**: árvore de 2 níveis, CRUD, arquivar, mesclar, **cor** e **ícone** (qualquer ícone do Lucide, com busca em português/inglês e sugestões) com pré-visualização da combinação ícone + cor. Subseção de **mapeamento Pluggy**.
5. **Regras**: CRUD com prioridade, pré-visualização ("quantas transações casam") e "aplicar às transações existentes não editadas pelo usuário".
6. **Limites**: CRUD e uso do mês atual.
7. **Metas**: CRUD, aportes, progresso e aporte mensal necessário.
8. **Reserva**: contas marcadas, configuração de alvo e indicadores.
9. **Contas** (`/contas`, antes "Conexões"): **resumo geral** (patrimônio, disponível, investido, cartões), items Pluggy, contas, contas manuais, botão "Sincronizar agora", histórico de `sync_runs`. Cada conta tem **apelido**, **banco** e **cor** editáveis; bancos conhecidos (Nubank, Itaú, Inter, Bradesco, Santander, Banco do Brasil, Caixa, C6, BTG, XP, Mercado Pago, PicPay, PagBank, Sicredi, Sicoob, Will Bank, Original) são detectados pelo nome da conexão/conta e trazem cor e logo em SVG. `/contas/[id]` mostra o **detalhe da conta**: saldo (ou fatura aberta), receitas/despesas do mês, evolução do saldo, detalhes e histórico de transações (período, busca, paginação). `/conexoes` redireciona para `/contas`.
10. **Calendário** (`/calendario`): grade do mês com o total **recebido** e **gasto** em cada dia (sem transferências e ignoradas), resumo do mês, navegação por mês, filtro por conta e por **várias categorias** (categoria inclui as subcategorias). Clicar num dia lista as transações dele. Estado na URL (`mes`, `dia`, `conta`, `categorias`).
11. **Configurações** (modal aberto pelo menu do perfil, com barra lateral de seções): **Aparência** (fundo Sistema/Claro/Cinza/Preto e cor de destaque entre 9 opções prontas, sem escolha livre; por aparelho, em cookie), **Conta** (alterar usuário e senha, ver §4) e **Sobre** (versão e empresa desenvolvedora, *FLTR Sistemas*).

### Layout e padrões de interface

- **Sidebar** à esquerda no desktop: item ativo destacado só pelo fundo (sem barra lateral), **recolhível** a apenas ícones com *tooltip* (`Ctrl/⌘ + B`; cookie `sidebar`), versão do sistema no rodapé, menu do perfil com *Configurações* e *Sair* (cor *destructive*). *Contas* tem como **subitens** as contas ativas (recolhíveis quando existe alguma). No celular, barra inferior e menu "Mais" com o mesmo conteúdo.
- **Sem controles nativos do navegador** para escolha: seletores (`FormSelect`) e cor (`ColorPicker`) próprios, no tema do sistema, compatíveis com formulários de Server Actions.
- A classificação por IA aparece ao usuário como "IA"; o nome do provedor (Jev) fica restrito à documentação técnica.
- **PWA instalável** (manifest, ícones 192/512/maskable, favicon, ícone iOS, `theme-color`, área segura do iPhone), sem modo offline.

Todas as telas são utilizáveis em telas de 360 px de largura (tabelas viram listas/cards no mobile).

## 9. Backup e exportação

- **Export CSV** das transações filtradas.
- Recuperação via histórico/branching do Neon (dentro do limite do free tier).
- Os dados bancários são reconstruíveis via Pluggy; as edições do usuário (categorias, notas, regras, metas) dependem do banco. Dump agendado fica fora do MVP.

## 10. Testes

Vitest, unitários e sem I/O, sobre funções puras de domínio:
- Detecção de transferências (pares, janela de 3 dias, sinais, contas distintas).
- Pipeline de categorização (prioridade de regras, limiares do Jev, fallback quando o Jev falha ou está desligado, mapeamento Pluggy).
- Tratamento de parcelas e pagamento de fatura.
- Merge da sync (campos do usuário preservados; pendente → confirmada).
- Cálculos: consumo de limite e estados, metas (aporte mensal necessário), reserva (média e meses de cobertura), agrupamento por mês no fuso `America/Sao_Paulo`.

Também testados (Vitest, sem navegador): cor e contraste (WCAG) das 9 cores de destaque nos fundos claro e escuro, ids de tema/cor vindos de cookie (nunca viram CSS sem validar), detecção de banco por nome e aparência da conta (cor escolhida > cor do banco), existência de todos os ícones sugeridos na versão instalada do Lucide, hash scrypt e regras do login do dono contra Postgres em memória (variáveis de ambiente, login salvo, troca e versão, tabela não migrada, falha fechada) e os totais por dia do calendário com filtro de várias categorias (incluindo payloads de SQL injection).

Sem E2E automatizado no MVP; as telas novas foram verificadas manualmente no navegador (desktop e celular, claro/cinza/preto) contra Postgres local e contra a demonstração.

## 11. Fora do MVP

- Investimentos detalhados (ativos, rentabilidade, IR). No MVP entra apenas o saldo.
- Recorrências e previsão/projeção de saldo.
- Importação OFX/CSV.
- Notificações (e-mail/push).
- Modo offline (o PWA instalável já existe; os dados vêm sempre do servidor).
- IA além do Jev na categorização (insights, chat, previsões).
- Multiusuário / compartilhamento familiar.
- Split de transações.
- Múltiplas moedas.
- Dia de início do mês configurável.
- API pública.
- Backup agendado (pg_dump).

## 12. Riscos e premissas

| Risco | Mitigação |
|---|---|
| Pluggy muda a gratuidade do MeuPluggy | Lançamento manual continua funcionando; OFX/CSV está no backlog como fallback |
| Consentimento Open Finance expira | Status e erro visíveis em Conexões, com instrução de renovar no MeuPluggy |
| Jev indisponível, mudança de API ou sem acesso | Feature flag; o pipeline funciona sem ele; módulo isolado |
| Free tier do Neon/Vercel (limites, cold start) | Volume pequeno; snapshots e agregações simples; aceitar cold start de ~1 s |
| Timeout de função na sync | Sync por conta, incremental e retomável |
| Vazamento de dados financeiros | Allowlist de um e-mail, segredos só no servidor, HTTPS, sem dados sensíveis em URL |

## 13. Critérios de aceite do MVP

- [ ] Só o e-mail permitido consegue entrar; a sessão persiste via cookie JWT.
- [ ] Contas do MeuPluggy aparecem após cadastrar os Item IDs; a primeira sync importa o histórico disponível.
- [ ] O cron diário e o botão manual sincronizam sem duplicar transações e sem sobrescrever edições.
- [ ] Pagamento de fatura e transferências próprias não contam como receita/despesa.
- [ ] Transações novas são categorizadas por regra → Jev (se ligado) → Pluggy → "A categorizar".
- [ ] Limites mostram os estados 80%/100% no mês corrente.
- [ ] Metas exibem progresso e aporte mensal necessário; a reserva exibe meses de cobertura.
- [ ] A dashboard filtra por período, conta, categoria e tipo, e mostra os comparativos temporais.
- [ ] Todas as telas funcionam em celular.
- [ ] Os testes Vitest das regras de domínio passam.
