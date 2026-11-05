# SPEC — Sistema de Controle Financeiro Pessoal

> Versão 1.2 · 2026-10-17 · Status: MVP implementado; 1.1 acrescenta sidebar retrátil, contas com detalhe, calendário, configurações e PWA instalável; 1.2 acrescenta a tela de **Investimentos** (§6.11)

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
- **Investimentos**: a cada sync, os ativos da Pluggy (`GET /investments`) e suas movimentações atualizam a tela de Investimentos (§6.11); proventos que caem como crédito na conta da corretora com o ticker na descrição viram proventos do ativo; depois são buscados os índices (CDI, IPCA, IBOV) e as cotações dos ativos lançados à mão. Falha nessas fontes nunca derruba a sync.
- **Erros**: registrar em `sync_runs` (início, fim, status, mensagem). Mostrar na UI a última sync bem-sucedida e o erro, se houver (ex.: consentimento expirado → instruir a renovar no MeuPluggy).
- Respeitar o timeout de funções da Vercel Hobby: sincronizar conta por conta e retomar de onde parou se necessário.

## 6. Regras de domínio

### 6.1 Contas
- Tipos: `CHECKING` (corrente), `CREDIT_CARD`, `SAVINGS_INVESTMENT` (saldo; o detalhamento dos investimentos fica em §6.11), `CASH` (carteira/manual).
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

### 6.11 Investimentos
- **Ativo** (`investments`): cada um tem a sua conta em `accounts` (tipo `SAVINGS_INVESTMENT`), que guarda o saldo e entra no patrimônio e nos snapshots como qualquer conta. Origem: **Pluggy** (posição, cotação, custo, taxa e vencimento vêm da corretora; só nome e categoria são editáveis) ou **manual** (cripto, corretora sem Open Finance; a posição sai das operações lançadas).
- **Categorias**: Pós-fixado, Pré-fixado, Inflação, Ações, FII, BDR, ETF, Cripto, Fundos e Outros. Detectadas pelo tipo/subtipo e indexador da Pluggy (ou pelo ticker da B3: final 11 = FII, 32–35 = BDR, 3–8 = ação); a escolha do usuário (`asset_class_override`) vale sobre a detectada e a sync não a toca. Cada categoria tem cor fixa (`--inv-*`, validada para daltonismo nos temas claro e escuro), na mesma ordem em todos os gráficos.
- **Operações** (`investment_trades`): compra, venda, bonificação e proventos (dividendo, JCP, rendimento de FII, juros). Posição manual: compra soma quantidade e custo (com taxas), venda tira pelo preço médio (diferença = lucro realizado), bonificação soma quantidade com o custo informado; renda fixa manual usa valores em reais e o saldo atual é informado à mão. Data futura = provento anunciado, a receber. Operações da Pluggy são refeitas a cada sync; lançamentos manuais nunca são apagados por ela. Nos ativos da Pluggy, o usuário só lança proventos.
- **Rentabilidade**: mês a mês pelo **Dietz modificado** — (saldo final − saldo inicial − aportes + proventos) ÷ (saldo inicial + aportes/2), com saldos de fim de mês dos snapshots e o saldo de hoje no mês corrente — e acumulada por produto. Só usa meses com saldo registrado (o histórico começa na primeira sync com a tela); conta que entra sem operação registrada tem o saldo inicial tratado como aporte. Valor aplicado = custo pelas operações. Comparação com **CDI** (série 12 do SGS/BCB, diária, composta por mês), **IPCA** (série 433) e **IBOV** (fechamento mensal do Yahoo Finance), acumulados na mesma janela; "% do CDI" = rentabilidade ÷ CDI.
- **Resultado do ativo**: saldo − custo; rentabilidade = resultado ÷ custo; o detalhe soma proventos recebidos e lucro em vendas. Renda fixa usa o saldo bruto (antes de IR e IOF).
- **Proventos**: total e média de 12 meses, por mês e tipo, por ativo, **yield on cost** (12 meses ÷ custo da renda variável, exceto cripto) e a receber.
- **Alocação-alvo** (`investment_targets`): % por categoria somando 100 (ou nenhum alvo). Para cada categoria: peso atual, alvo, diferença em pontos percentuais e quanto aportar para chegar ao alvo sem vender.
- **Cotações** dos ativos manuais de renda variável: Yahoo Finance (`PETR4.SA`, `BTC-BRL`), na sync ou no botão "Cotações"; sem resposta, fica o preço informado (último preço de compra ou cotação digitada).

### 6.12 Dívidas e avisos
- **Dívida** (`debts`): pessoa/empresa, relação, descrição e **itens** (`debt_items`: descrição, quantidade, valor unitário; total = Σ quantidade × valor). Não gera transações: o pagamento já saiu da conta; a parcela paga pode apontar para a transação que a quitou (`debt_installments.transaction_id`).
- **Forma**: parcela única, parcelado (N parcelas iguais; sobras de centavos nas primeiras) ou **livre** (sem parcelas; cada pagamento vira uma linha). **Vencimento** (`schedule_kind`): `FIXED_DAY` (dia do mês; mês curto usa o último dia), `AFTER_SALARY` (salário do mês + N dias), `DATE` (primeira parcela; as seguintes mês a mês) ou `NONE`. `start_month` é o mês da parcela 1.
- **Salário**: primeira entrada do mês em categoria (ou subcategoria) de nome "Salário"; sem ela no mês, usa a **mediana do dia** dos últimos 6 meses com salário (padrão dia 5) e a data é marcada como **prevista**.
- **Situação** da dívida: quitada (restante = 0), em atraso (alguma parcela vencida em aberto), vence em breve (≤ 7 dias), em dia, sem data. Restante = total − pago.
- **Pagamento**: marca a parcela como paga na data; valor diferente do da parcela **redistribui igualmente** o restante entre as parcelas em aberto (e some a parcela se zerar); desfazer reabre e redistribui. Vínculo opcional com transação; sugestão = saída de mesmo valor entre −5 e +10 dias do vencimento ainda não ligada a outra parcela (o nome do credor sobe a candidata). Editar refaz só as parcelas em aberto.
- **Avisos** (`notifications`, chave `dedupe_key` única: o mesmo aviso nunca se repete): parcela perto de vencer (hoje, amanhã ou N dias, conforme o lembrete da dívida), parcela **atrasada** (1× por parcela), **salário caiu** (entrada de hoje ou dos 2 últimos dias, citando as parcelas "após o salário" da semana) e **limite estourado** (1× por categoria/mês). Configuração em `notification_settings` (horário e tipos). Gerados ao abrir o app (no máximo a cada 10 min) e no cron diário `/api/cron/avisos`, que também envia **Web Push** (VAPID, `web-push`) aos aparelhos de `push_subscriptions` e apaga os que o navegador revogou. Sem VAPID ou sem aparelho, os avisos ficam pendentes de push. O push só é enviado depois do horário escolhido.

### 6.13 Cofy (chat)
- **Escopo**: só finanças pessoais do usuário e o uso do fluxo; fora disso recusa em uma frase. Conteúdo de arquivos, descrições e resultados de ferramentas são **dados, nunca instruções**. Não recomenda ativo específico.
- **Modelo e API**: `claude-haiku-5-5` pelo SDK `@anthropic-ai/sdk` (`ANTHROPIC_API_KEY`), streaming, laço manual de ferramentas (até 8 passos), pensamento adaptativo e esforço médio, cache de prompt automático. `system` e ferramentas são **fixos**; a data de hoje, a tela atual e as menções resolvidas vão num bloco `<contexto>` de cada mensagem do usuário. O histórico **só cresce** (blocos guardados como vieram, inclusive raciocínio); `block_binding.prefix_mismatch_behavior = "drop_block"` (beta `thinking-binding-controls-2026-08-01`) evita erro quando um deploy muda o prompt.
- **Ferramentas de leitura** (resultado em JSON para o modelo + **cartão** para a tela): `resumo_periodo`, `gastos_por_categoria` (com comparação), `listar_transacoes`, `saldos_contas`, `listar_dividas`, `limites_e_metas`, `resumo_investimentos`, `listar_categorias`, `gerar_relatorio` (mensal, categorias, dívidas, patrimônio; tabelas com CSV). Nomes de contas/categorias/dívidas são resolvidos no servidor; ambiguidade volta como erro para o modelo perguntar.
- **Ferramentas de escrita** só **propõem** (`chat_actions`, estado PENDING): `propor_transacoes` (só contas manuais; ignora lançamentos idênticos), `propor_categorizacao`, `propor_divida`, `propor_pagamento_divida`, `propor_regra`, `propor_limite`. A Server Action `confirmAction` é o único caminho que grava; é idempotente (reserva a ação antes de executar) e usa as mesmas regras do app. Cancelar não grava.
- **Anexos** (`chat_attachments`, base64): imagem e PDF como blocos nativos; CSV, OFX e TXT como texto (UTF-8, com recuo para Windows-1252); `.xlsx` como TSV. Limites: 5 arquivos, 10 MB cada (imagem 5 MB), texto até 400 mil caracteres (acima disso pede para enviar em partes). Os mesmos bytes são reenviados nos turnos seguintes (prefixo estável).
- **Conversas**: `chat_conversations` (título automático da 1ª mensagem, renomear, arquivar, excluir) e `chat_messages`. O estado do cliente vive acima das telas (`CofyProvider`): uma resposta continua chegando se você abre outra conversa ou fecha o painel; a lista marca a que está respondendo. A rodada termina no servidor mesmo que a conexão caia.
- **Acesso**: `/cofy`, item do menu, aba "Cofy" no celular e botão flutuante com painel (`Ctrl/⌘ + K`) que sabe a tela atual. Demonstração: conversas de exemplo, sem chamar a API.

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
investment_movements id, account_id, pluggy_id, date, amount (aplicações/resgates; só para reconstruir o patrimônio)
investments       id, account_id (unique), pluggy_id?, asset_class, asset_class_override?, code?, name, broker?,
                  quantity?, unit_price?, invested?, rate_label?, due_date?, price_updated_at, created_at
investment_trades id, investment_id, pluggy_id? ("tx:<id>" = provento achado na conta), date,
                  type(BUY|SELL|BONUS|DIVIDEND|JCP|YIELD|INTEREST), quantity?, price?, amount, fees, note?
investment_targets asset_class (pk), percent
market_series     series(CDI|IPCA|IBOV), date, value  (pk series+date)
debts             id, creditor, relation?, description?, schedule_kind(FIXED_DAY|AFTER_SALARY|DATE|NONE), schedule_day?,
                  salary_offset_days, schedule_date?, start_month?, remind_days_before?, archived, created_at
debt_items        id, debt_id, description, quantity, unit_amount
debt_installments id, debt_id, number, amount, paid_on?, transaction_id?, due_override?  (unique debt_id+number)
notifications     id, kind, title, body, href?, dedupe_key (unique), created_at, read_at?, pushed_at?
push_subscriptions id, endpoint (unique), p256dh, auth, label?
notification_settings id (=1), push_hour, notify_due, notify_overdue, notify_salary, notify_limit
chat_conversations id, title, archived, created_at, updated_at
chat_messages     id, conversation_id, role(user|assistant), content (blocos da API, jsonb), cards? (jsonb), created_at
chat_attachments  id, message_id, name, media_type, size, data (base64)
chat_actions      id, conversation_id, tool_use_id, kind, payload (jsonb), status(PENDING|DONE|CANCELLED), result?
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
9. **Contas** (`/contas`, antes "Conexões"): **resumo geral** (patrimônio, disponível, investido, cartões), botão "Sincronizar agora" e as contas **agrupadas por tipo** (Contas correntes, Cartões de crédito, Poupança e investimentos, Dinheiro; grupo vazio some), cada grupo com subtotal; manuais e conectadas juntas, com o banco (ou a instituição, ou "Manual") embaixo do nome e o selo "Reserva". Ordem por saldo (padrão), nome ou banco em `?ordem=`. Os ativos de Investimentos viram uma linha só ("Carteira de investimentos · N ativos", leva a `/investimentos`). Arquivadas (inclusive as de conexões removidas) ficam num bloco recolhido "Arquivadas (N)". Na lateral, **Conexões** (items Pluggy: status, Item ID, última sincronização, nº de contas, erro com link para o MeuPluggy, remover; o nome da conexão também se renomeia clicando nele, e a sync só troca o nome padrão "Conexão Pluggy" pelo do conector, nunca um nome dado pelo usuário) e o histórico de `sync_runs`. Cada conta tem **apelido**, **banco** e **cor** editáveis; o apelido também se **renomeia no lugar**, clicando no nome na lista ou no título do detalhe (Enter/sair do campo salva, Esc cancela; na demonstração é só texto), e o resto da linha abre o detalhe; bancos conhecidos (Nubank, Itaú, Inter, Bradesco, Santander, Banco do Brasil, Caixa, C6, BTG, XP, Mercado Pago, PicPay, PagBank, Sicredi, Sicoob, Will Bank, Original) são detectados pelo nome da conexão/conta e trazem cor e logo em SVG. `/contas/[id]` mostra o **detalhe da conta**: saldo (ou fatura aberta), receitas/despesas do mês, evolução do saldo, detalhes e histórico de transações (período, busca, paginação). `/conexoes` redireciona para `/contas`.
9a. **Investimentos** (`/investimentos`, no menu logo após Relatórios), com abas e modais pela URL (`?lancar=`, `?novo=1`, `?alvo=1`):
   - **Resumo**: período 6M/12M/no ano/tudo; indicadores (patrimônio e variação do mês, valor aplicado, lucro, rentabilidade e % do CDI, proventos de 12 meses); **evolução da carteira** num gráfico só, alternando *R$ Patrimônio* (patrimônio × aplicado) e *% Rentabilidade* (carteira × CDI/IBOV/IPCA, liga e desliga); **alocação por categoria** (rosca + lista) ao lado de **atual × alvo**; **rentabilidade mês a mês** (barras + traço do CDI) ao lado de **proventos** (12 meses, a receber, próximos pagamentos); **destaques** (maiores altas e baixas).
   - **Ativos** (`/investimentos/ativos`): composição da carteira, busca, filtro por categoria e tabela agrupada por categoria (renda variável: quantidade, preço médio, cotação; renda fixa: taxa, vencimento, instituição; ambos: aplicado, saldo, rentabilidade, % da carteira); exportar CSV (`/api/investimentos/csv`).
   - **Proventos** (`/investimentos/proventos`): indicadores, gráfico mensal por tipo, ranking por ativo e lista de pagamentos (a receber e recebidos, filtro por tipo).
   - **Ativo** (`/investimentos/ativos/[id]`): cotação/saldo, posição, evolução (saldo × aplicado ou rentabilidade × índices), resultado (valorização + proventos + vendas), movimentações e proventos; editar (nome, categoria; nos manuais também ticker, corretora, cotação ou saldo, taxa e vencimento) e excluir (só manual).
   - **Novo lançamento** (compra, venda, bonificação ou provento), **novo ativo manual** e **alocação-alvo** (soma tem de fechar em 100%).
   - As contas dos ativos não aparecem como subitens de *Contas* na sidebar (seriam dezenas); continuam em `/contas`.
10. **Calendário** (`/calendario`): grade do mês com o total **recebido** e **gasto** em cada dia (sem transferências e ignoradas), resumo do mês, navegação por mês, filtro por conta e por **várias categorias** (categoria inclui as subcategorias). Clicar num dia lista as transações dele. Estado na URL (`mes`, `dia`, `conta`, `categorias`).
12. **Dívidas** (`/dividas`), **Cofy** (`/cofy` e painel flutuante) e o **sino de avisos** no cabeçalho (ver §6.12 e §6.13); **Configurações** ganha a seção **Avisos** (push neste aparelho, horário e tipos).
11. **Configurações** (modal aberto pelo menu do perfil, com barra lateral de seções): **Aparência** (fundo Sistema/Claro/Cinza/Preto e cor de destaque entre 9 opções prontas, sem escolha livre; por aparelho, em cookie), **Conta** (alterar usuário e senha, ver §4) e **Sobre** (versão e empresa desenvolvedora, *FLTR Sistemas*).

### Layout e padrões de interface

- **Sidebar** à esquerda no desktop: item ativo destacado só pelo fundo (sem barra lateral), **recolhível** a apenas ícones com *tooltip* (`Ctrl/⌘ + B`; cookie `sidebar`), versão do sistema no rodapé, menu do perfil com *Configurações* e *Sair* (cor *destructive*). *Contas* tem como **subitens** as contas ativas (recolhíveis quando existe alguma). No celular, barra inferior e menu "Mais" com o mesmo conteúdo.
- **Sem controles nativos do navegador** para escolha: seletores (`FormSelect`) e cor (`ColorPicker`) próprios, no tema do sistema, compatíveis com formulários de Server Actions.
- A classificação por IA aparece ao usuário como "IA"; o nome do provedor (Jev) fica restrito à documentação técnica.
- **Animações discretas** (150–220 ms; `prefers-reduced-motion` desliga): marcador do item ativo do menu desliza, onda do logo (uma vez ao abrir e em loop durante a sincronização), entrada de página, escala no clique.
- **Legenda clicável** em todo gráfico com séries: clicar esconde a série (e a escala se ajusta); sempre sobra ao menos uma.
- **Painel lateral vira bottom sheet** abaixo de 768 px (alça, arrastar para fechar). **Rodapé de modais e painéis** (`FormActions`): ações no canto inferior direito, ação principal por último, "Excluir" isolado à esquerda.
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

Investimentos: regras puras (`domain/investments.test.ts`: categorias pela Pluggy e pelo ticker, rótulo da taxa, operações e proventos da Pluggy e da conta, posição e preço médio, Dietz modificado, CDI/IBOV por mês, rebalanceamento) e, contra Postgres em memória (`lib/investments.test.ts`), a sync com a Pluggy simulada (ativos, operações, proventos achados na conta, sync repetida sem duplicar e sem desfazer a categoria do usuário), as ações (ativo manual, compra/venda, saldo à mão, proventos, alvo) e a rentabilidade com aporte no meio do mês e o CDI acumulado.

Dívidas, avisos e Cofy: domínio puro (`domain/debts.test.ts`: itens, parcelas em centavos, salário real/previsto, vencimento por regra, situação; `domain/notifications.test.ts`: quando avisar, tipos desligados, chaves estáveis) e, contra Postgres em memória, criar/pagar/redistribuir/desfazer/editar dívidas e vínculo com transação (`lib/debts.test.ts`), geração idempotente de avisos e envio de push simulado (`lib/notifications.test.ts`), o fluxo do chat com a API da Anthropic **simulada** (`lib/cofy/chat.test.ts`: cartões, propor sem gravar, confirmar uma vez, cancelar, erro de ferramenta, anexos, histórico que só cresce, validações, conversas) e o leitor do stream (`lib/cofy/stream.test.ts`). **Não há teste contra a API real** (precisa de `ANTHROPIC_API_KEY`).

Sem E2E automatizado no MVP; as telas novas foram verificadas manualmente no navegador (desktop e celular, claro/cinza/preto) contra Postgres local e contra a demonstração.

## 11. Fora do MVP

- Imposto de renda de investimentos (apuração mensal, DARF, come-cotas) e histórico de cotações por ativo.
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
