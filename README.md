# Finanças — controle financeiro pessoal

MVP do [SPEC.md](SPEC.md): Next.js 16 + Drizzle + Postgres (Neon) + Auth.js (Google, sessão JWT) + Pluggy (MeuPluggy) + Jev opcional.

## Rodar localmente

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha (veja abaixo). Para explorar sem Google, use `AUTH_DEV_LOGIN=1` (só funciona fora de produção).
3. `npm run db:migrate`
4. `npm run dev` → entre, vá em **Categorias → Criar categorias padrão**, depois **Contas** para cadastrar conexões ou contas manuais.

Testes de domínio: `npm test`.

## Configuração (uma vez)

| Variável | Onde obter |
|---|---|
| `DATABASE_URL` | Neon (free) → connection string *pooled* |
| `AUTH_SECRET` | `npx auth secret` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google Cloud Console → OAuth client "Web". Redirect URI: `https://SEU-DOMINIO/api/auth/callback/google` (e `http://localhost:3000/...` para dev) |
| `ALLOWED_EMAIL` | seu e-mail Google (único que entra) |
| `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` | dashboard.pluggy.ai → aplicação com o conector **MeuPluggy** ativo |
| `CRON_SECRET` | qualquer string aleatória longa; a Vercel envia no header do cron |
| `JEV_API_KEY` / `JEV_API_URL` | opcional; sem eles a classificação por IA fica desligada |

Open Finance: conecte seus bancos em meu.pluggy.ai, copie o **Item ID** de cada conexão e cadastre em **Contas**.

## Deploy (Vercel Hobby)

1. Importe o repositório na Vercel e configure as variáveis acima.
2. Rode `npm run db:migrate` apontando para o Neon (localmente, com o `DATABASE_URL` de produção).
3. O cron diário está em `vercel.json` (09:00 UTC = 06:00 em Brasília).

## Estrutura

- `src/lib/domain/` — regras de negócio puras (datas, categorização, transferências, merge da sync, cálculos) + `domain.test.ts`
- `src/lib/sync.ts` — sincronização Pluggy (incremental, retomável por conta), `ledger.ts` (pipeline de categorização, transferências, saldos), `queries.ts` (dashboard/listas), `jev.ts` (cliente Jev isolado)
- `src/app/(app)/*` — telas; cada uma com seu `actions.ts` (Server Actions validadas com Zod e protegidas por `requireUser`)
- `src/db/schema.ts` — schema Drizzle; migrações em `drizzle/`

## Desvios conscientes do SPEC

- "A categorizar" é `subcategory_id = null` (em vez de uma categoria de sistema); transferências também ficam sem categoria.
- Exemplos para o Jev vêm das transações categorizadas pelo usuário (sem tabela `categorization_examples`).
- Vínculo manual de transferência é "marcar/desmarcar como transferência" por transação; o pareamento é automático.
- Filtros de conta e categoria na dashboard são de seleção única.
- O formato da API do Jev em `src/lib/jev.ts` é provisório (early access, sem documentação pública).
