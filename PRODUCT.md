# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

PWA instalável (Android, iOS, desktop), `display: standalone`, sem modo offline. No celular é usado em retrato; no desktop, com sidebar.

## Users

- **O dono (usuário principal):** uma única pessoa, que controla as próprias finanças. Usa o fluxo **tanto no celular quanto no desktop, com o mesmo peso**: no celular, olhadas rápidas ao longo da semana (quanto gastei, o que vence, categorizar algo, perguntar ao Cofy); no desktop, sessões mais longas de revisão (relatórios, investimentos, regras, limites, fechamento do mês).
- **Visitante da demonstração:** quem entra pelo login de demo (dados fictícios fixos, somente leitura). A demo é **vitrine da FLTR Sistemas** para clientes e recrutadores: chega sem contexto e precisa entender e se impressionar com o produto sem explicação.

## Product Purpose

Controle financeiro pessoal completo num lugar só: importa contas e transações de todos os bancos por Open Finance, categoriza receitas e despesas em dois níveis, acompanha limites, metas, reserva de emergência, dívidas e a carteira de investimentos, avisa o que vence e responde perguntas pelo Cofy. Sucesso é o dono saber, a qualquer momento e em segundos, para onde o dinheiro foi, o que vem pela frente e como o patrimônio evolui, sem planilha e sem digitar o que o banco já sabe.

## Positioning

O que o fluxo tem que Mobills, Organizze ou o app do banco não podem copiar com verdade:

- **Feito do jeito do dono.** Regras, categorias, dívidas (inclusive "vence N dias após o salário") e telas moldadas a uma vida financeira real, não a uma média de mercado.
- **Tudo num lugar, de graça.** Open Finance de todos os bancos (Pluggy/MeuPluggy) + investimentos + dívidas, com custo de infraestrutura zero (só free tiers).
- **Privacidade e controle.** Os dados ficam com o dono: sem anúncios, sem venda de dados, sem terceiros vendo; um único login com acesso aos dados reais.

O Cofy é um recurso importante, mas não foi apontado como o diferencial central.

## Operating Context

- Sincronização diária automática (cron 06:00 de Brasília) e botão "Sincronizar"; consentimento Open Finance renovado no meu.pluggy.ai.
- Lançamento manual para contas sem Open Finance (cripto, corretoras, dinheiro).
- Avisos por Web Push e sino no app: vencimento e atraso de dívida, salário que caiu, limite estourado.
- Modo privado borra todos os valores (uso em público, compartilhar tela).
- A demo é aberta por terceiros em qualquer aparelho, sem orientação.

## Capabilities and Constraints

- **Telas:** Dashboard, Transações, Calendário, Relatórios, Investimentos (resumo, ativos, proventos, ativo), Contas e detalhe da conta, Categorias, Regras, Limites, Metas, Reserva, Dívidas, Cofy, Configurações (Aparência, Conta, Avisos, Sobre), Login.
- **Regras de domínio que a interface nunca contradiz:** valor e data de transações importadas são imutáveis; edições do usuário nunca são sobrescritas pela sincronização; dívidas não criam transações; escritas do Cofy são sempre propostas que exigem confirmação.
- **Um usuário:** sem cadastro, sem multi-tenant, sem billing. Multiusuário está fora de escopo (o MeuPluggy só é gratuito para o próprio CPF).
- **Demo:** somente leitura, dados de `src/db/demo-seed.ts`, conversas de exemplo do Cofy sem chamar a API.
- **Dependências opcionais não quebram o fluxo:** sem chave da Anthropic o Cofy abre mas não responde; sem VAPID não há push; sem IA de classificação o pipeline segue.
- **Terminologia:** a classificação automática aparece como "IA" (o nome do provedor não aparece para o usuário). "Contas" (antes "Conexões"). Moeda BRL, datas e números em pt-BR.
- **Fora do escopo atual:** modo offline, recorrências/projeção de saldo, importação OFX/CSV de extrato, split de transações, múltiplas moedas, imposto de renda de investimentos.

## Brand Commitments

- **Nome:** "fluxo", sempre em minúsculas, de "fluxo de caixa". Assinatura "por FLTR Sistemas".
- **Mascote:** Cofy, porquinho-cofrinho de perfil; calmo, direto, número primeiro, só fala de finanças e do fluxo, não recomenda ativo específico.
- **Voz:** PT-BR, direta, segunda pessoa implícita. Botões dizem o que fazem; erros dizem o que houve e o que fazer. Sem exclamações, sem emoji, sem "Ops!".
- Identidade visual, logo e tokens estão registrados em `DESIGN.md`.

## Evidence on Hand

- Dados fictícios da demo: `src/db/demo-seed.ts`.
- Logos dos bancos vêm do repositório Tgentil/Bancos-em-SVG (`public/banks/`); marcas pertencem aos donos.
- **Não há** depoimentos, clientes, métricas de uso, preços ou imprensa. Nada disso pode ser inventado, nem na demo.

## Product Principles

1. **Clareza em segundos.** Cada tela responde uma pergunta sobre dinheiro de imediato, tanto na olhada rápida do celular quanto na revisão do desktop.
2. **O banco é a fonte da verdade; o dono tem a última palavra.** Nada importado é adulterado e nada que o dono editou é desfeito.
3. **Confirmação antes de gravar.** Automação (regras, IA, Cofy) sugere; o dono decide.
4. **Privado por padrão.** Os dados nunca saem do controle do dono; valores podem ser escondidos a qualquer momento.
5. **A demo vende sozinha.** Quem chega sem contexto entende o produto pelos próprios dados fictícios, sem tutorial.

## Accessibility & Inclusion

- Alvos de toque ≥ 44 px e ação principal ao alcance do polegar no celular; tudo utilizável a partir de 360 px de largura.
- `prefers-reduced-motion` desliga as animações.
- Cor nunca é o único sinal (receita/despesa, categorias de investimento com legenda e % escritos; paletas validadas para daltonismo).
