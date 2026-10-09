# Rovere Finance

Plataforma de gestão financeira pessoal para o mercado brasileiro. Projeto greenfield com importação CSV **e OFX obrigatória na V1**, independente de Open Finance.

**Estado: importação RF-014/RF-018, faturas RF-020 e compras RF-021 implementadas.** CSV/OFX privados, confirmação atômica/idempotente, fatos de fatura e compras manuais completas/parciais com histórico e versão. Cobranças são associadas explicitamente, sem inferir total/data original nem duplicar registros. Sem saldos, limites, plano completo, pagamentos ou orçamento. [Compras](docs/purchases.md), [faturas](docs/card-statements.md) e [progresso](docs/progress.md).

RF-015 integrada pelo PR #2 e RF-016 pelo PR #4. Parsers CSV/OFX em `packages/importers`: [catálogo](docs/import-formats.md). A revisão nunca cria movimentações automaticamente.

## Retomar o trabalho

Leia [AGENTS.md](AGENTS.md), [progresso](docs/progress.md), [tasks](docs/tasks/README.md) e [índice do planejamento](PLANEJAMENTO_ARQUITETURA.md). A arquitetura geral foi aprovada; as recomendações de negócio foram adotadas nas [políticas da v0](docs/v0-policies.md).

## Execução local

Requisitos: Node.js 24 LTS (mínimo 24.14), npm 11. As versões exatas instaladas estão no `package-lock.json`.

```sh
npm ci
docker compose up -d db mailpit --wait
# Copie .env.example para .env (PowerShell: Copy-Item .env.example .env).
npm run db:migrate
npm run check
```

Em terminais separados:

```sh
npm run dev:api
npm run dev:web
```

Frontend em `http://localhost:5173` (mesma origem de `APP_ORIGIN` no `.env`). API em `http://127.0.0.1:3100/api/health`; `/api/ready` verifica banco. O Vite encaminha `/api` para a API local na porta 3100. Abra os emails fictícios no [Mailpit local](http://127.0.0.1:18025). Por enquanto, mudanças TypeScript da API exigem repetir o build/reiniciar `dev:api`; o watcher acompanha apenas o JavaScript compilado. Execute `npm run db:generate` após alterar o schema; build/typecheck/test já fazem isso automaticamente.

## Comandos

| Comando | Escopo |
|---|---|
| `npm run docs:check` | Links, estrutura das tasks e integridade do histórico |
| `npm run typecheck` | Tipos dos workspaces |
| `npm test` | Primitivas do domínio e configuração segura |
| `npm run db:migrate` | Aplica migrations versionadas sem reset do banco |
| `npm run test:integration` | API, sessões, email, destinos, upload/revisão, concorrência e recuperação em PostgreSQL real |
| `npm run test:e2e` | Jornada no Chromium; antes, `npx playwright install chromium` |
| `npm run build` | Compilação do domínio, API e frontend |
| `npm run smoke:web` | HTTP do frontend compilado e assets; executar após build, não substitui E2E |
| `npm run check` | Documentação, tipos, unitários, builds e smoke; integração/E2E são separados |

## Docker Compose — ambiente local

É necessário Docker Engine Linux ativo. Credenciais padrão são fictícias e exclusivas de desenvolvimento, definidas em `.env.example`. Copie esse arquivo para `.env` se precisar alterar os valores. O Compose inclui banco, migração de execução única, API, frontend e Mailpit sem encaminhamento de emails externos.

```sh
docker compose config --quiet
docker compose up --build -d --wait
docker compose ps
docker compose down
```

Frontend em `http://127.0.0.1:18080`, API em `http://127.0.0.1:3100/api/health` e PostgreSQL em `127.0.0.1:15432`. As portas externas são configuráveis por `WEB_PORT`, `API_PORT` e `POSTGRES_PORT`; as internas são 8080, 3000 e 5432. Os serviços expõem portas apenas em loopback. O volume PostgreSQL é preservado por `down`; não usar `down -v` para um ambiente com dados a conservar. Pare os containers antes de iniciar os servidores locais nas mesmas portas.

Mailpit recebe SMTP em `127.0.0.1:11025` e mostra mensagens em `http://127.0.0.1:18025`. O Compose fixa `APP_ORIGIN` na URL web acima; acessar por outro hostname exige ajustar essa origem. A migração precisa concluir antes de a API iniciar. Não há seed de usuários/senhas; crie sua conta pela interface e confirme o email local.

Integração e E2E requerem `db` e `mailpit` ativos. Criam `rovere_test` se necessário, aplicam migrations em schema aleatório e removem somente o schema da própria execução. `TEST_DATABASE_URL` deve apontar especificamente para `rovere_test`; `SMTP_URL` e `MAILPIT_URL` podem configurar o receptor local. Não execute testes com SMTP real. Artefatos e traces ficam em `test-results`, ignorado pelo Git.

Este Compose é de desenvolvimento (`NODE_ENV=development`, HTTP e segredos fictícios). Produção exige HTTPS, segredo próprio com pelo menos 32 caracteres, PostgreSQL e SMTP configurados; a API recusa configuração inadequada. Leia o [contrato de identidade e limitações](docs/identity.md) antes de disponibilizar o serviço.

## Estrutura

- `apps/web`: React/Vite.
- `apps/api`: NestJS/REST.
- `packages/domain`: valores, datas e contratos sem frameworks.
- `docs`: arquitetura, domínio, decisões, tasks e evidências.
- `scripts`: verificações de manutenção do repositório.

CI definida em `.github/workflows/ci.yml`; sua presença não significa que já executou no GitHub. Não há licença de distribuição escolhida ainda. Não versionar arquivos financeiros pessoais ou segredos.
