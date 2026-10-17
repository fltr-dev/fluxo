# Plano de implementação: Dívidas, avisos, Cofy e melhorias de layout

Design aprovado: https://claude.ai/artifact/KzN2uLifGgunbUCX7rEoNi (14 telas). Este plano traduz o design em lógica.
Decisões já tomadas com o usuário: mascote **Cofy** (porquinho-cofrinho de perfil), avisos por **push + central no app**, IA pela **API da Anthropic** (`claude-haiku-5-5`), escritas da IA **sempre com confirmação**.

## 0. Ajustes pedidos na aprovação

- Cabeçalho: **manter** o botão de esconder valores e o status da sincronização (um pouco menores); **tirar** "Perguntar ao Cofy"; só **adicionar o sino** de avisos. O acesso ao Cofy fica no menu lateral, na barra do celular (no lugar de Relatórios) e no botão flutuante (Ctrl+K).

## 1. Banco de dados (uma migração: `0004_dividas_avisos_cofy.sql`)

| Tabela | Campos principais |
|---|---|
| `debts` | credor, relação, descrição, cor, `schedule_kind` (FIXED_DAY / AFTER_SALARY / DATE / NONE), `schedule_day`, `salary_offset_days`, `schedule_date`, `start_month`, `remind_days_before`, `archived` |
| `debt_items` | dívida, descrição, quantidade, valor unitário (psicólogo: 4×90 + 2×110 = itens separados) |
| `debt_installments` | dívida, número, valor, `paid_on`, `transaction_id` (Pix ligado), `due_override` |
| `notifications` | tipo, título, texto, link, `dedupe_key` único, `read_at`, `pushed_at` |
| `push_subscriptions` | endpoint único, chaves p256dh/auth, rótulo do aparelho |
| `notification_settings` | linha única: horário, tipos ligados (vencimento, atraso, salário, limite) |
| `chat_conversations` | título, arquivada, datas |
| `chat_messages` | conversa, papel, `content` jsonb (blocos da API, inclusive thinking, repassados sem alteração) |
| `chat_attachments` | mensagem, nome, tipo, tamanho, dados (base64) |
| `chat_actions` | ações propostas pela IA aguardando confirmação (PENDING / DONE / CANCELLED) |

## 2. Dívidas

- Domínio puro e testado (`src/lib/domain/debts.ts`): total dos itens, divisão em parcelas, vencimento de cada parcela por regra, situação (atrasada / vence em breve / em dia / quitada), próximos 30 dias.
- Regra **após o salário**: salário do mês = primeira entrada em categoria "Salário" no mês; se ainda não caiu, estimativa pela mediana do dia dos últimos 6 meses (padrão dia 5). Vencimento = salário + N dias.
- Pagamento registrado por parcela, com vínculo opcional a uma transação; o app **sugere** o vínculo (mesmo valor, ±dias do vencimento). Dívidas não criam transações: o dinheiro já saiu da conta e só é rastreado aqui.
- Telas: `/dividas` (KPIs, alerta de atraso, abas, próximos 30 dias), painel de detalhe (`?ver=`), modal de nova/editar (`?nova=1`, `?editar=`). Calendário ganha os vencimentos e o salário previsto, com filtros.

## 3. Avisos

- `generateNotifications()` idempotente (dedupe por chave): vencimento amanhã/hoje, atraso, salário caiu, limite de categoria estourado.
- Sino no cabeçalho com contador e popover; página/painel de configuração (push por aparelho, horário, tipos).
- Web Push: `public/sw.js`, chaves VAPID em variáveis de ambiente, `/api/push/subscribe`, envio com `web-push` pelo cron diário `/api/cron/avisos`. Demonstração não envia push.

## 4. Cofy (chat)

- `POST /api/cofy` (multipart: mensagem, conversa, anexos) responde em streaming (NDJSON). SDK oficial `@anthropic-ai/sdk`, modelo `claude-haiku-5-5`, laço manual de ferramentas, `ANTHROPIC_API_KEY`.
- Prompt de sistema restringe a finanças pessoais e ao fluxo; fora disso recusa. Números sempre vêm de ferramentas.
- Ferramentas de **leitura** (resumo do mês, gastos por categoria, transações, contas, dívidas, limites, metas, investimentos, relatório) devolvem dados estruturados que a tela mostra como cartões do próprio fluxo.
- Ferramentas de **escrita** (propor transações, dívida, pagamento, categorização, regra) **não executam**: gravam em `chat_actions` e a tela mostra o cartão "aguardando sua confirmação". Só a Server Action `confirmAction` grava, usando as mesmas funções do app.
- Anexos: imagem e PDF vão como blocos nativos; CSV/OFX/TXT como texto; Excel convertido em texto. Só o turno que enviou o arquivo carrega o conteúdo.
- Menções `@conta`, `@dívida`, `#categoria` resolvidas para ids antes do envio.
- Histórico: lista, renomear, arquivar, excluir, nova conversa a qualquer momento (conversa em andamento continua).
- Acesso: `/cofy` (tela cheia), botão flutuante com painel (Ctrl+K) com o contexto da tela atual.
- Demonstração: histórico de exemplo e campo desativado (sem custo de API).

## 5. Melhorias gerais

- Animações curtas (150–220 ms, `prefers-reduced-motion` desliga): marcador do menu desliza, onda do logo (uma vez ao abrir, em loop durante a sincronização), entrada de página, escala 0,97 no clique.
- Legenda clicável nos gráficos (`useSeriesToggle` + `ToggleLegend`), sempre com ao menos uma série visível.
- Painéis laterais viram **bottom sheet** abaixo de 768px, com alça e arrastar para fechar.
- Rodapé padrão `FormActions` em todo modal/painel: ações no canto inferior direito, "Excluir" isolado à esquerda.

## 6. Ordem e verificação

1. Esquema e migração, cabeçalho/menus → 2. Dívidas → 3. Avisos e push → 4. Cofy → 5. Melhorias (transversais) → 6. Documentação.
Cada etapa: `tsc`, `eslint`, `vitest` (domínio + integração com PGlite), captura de tela com Playwright (desktop, 390px, escuro). A API da Anthropic é simulada nos testes.
