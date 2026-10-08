# Rovere Finance

Plataforma de gestão financeira pessoal para o mercado brasileiro. Projeto greenfield com importação CSV **e OFX obrigatória na V1**, independente de Open Finance.

**Estado: fundação técnica em desenvolvimento.** A página inicial informa que o produto está em construção. Autenticação, banco integrado, movimentações e importadores ainda não estão disponíveis. Consulte [progresso](docs/progress.md) para evidências e limitações.

## Retomar o trabalho

Leia [AGENTS.md](AGENTS.md), [progresso](docs/progress.md), [tasks](docs/tasks/README.md) e [índice do planejamento](PLANEJAMENTO_ARQUITETURA.md). A arquitetura geral foi aprovada; decisões financeiras específicas ainda abertas estão [registradas](docs/decisions/pending.md).

## Execução local

Requisitos: Node.js 24 LTS (mínimo 24.14), npm 11. As versões exatas instaladas estão no `package-lock.json`.

```sh
npm ci
npm run check
```

Em terminais separados:

```sh
npm run dev:api
npm run dev:web
```

Frontend em `http://127.0.0.1:5173`. API em `http://127.0.0.1:3100/api/health`. O Vite encaminha `/api` para a API local na porta 3100. O endpoint é liveness; não declara conexão com banco ou prontidão financeira. Por enquanto, mudanças TypeScript da API exigem repetir o build/reiniciar `dev:api`; o watcher acompanha apenas o JavaScript compilado.

## Comandos

| Comando | Escopo |
|---|---|
| `npm run docs:check` | Links, estrutura das tasks e integridade do histórico |
| `npm run typecheck` | Tipos dos workspaces |
| `npm test` | Primitivas do domínio e HTTP real de liveness |
| `npm run build` | Compilação do domínio, API e frontend |
| `npm run smoke:web` | HTTP do frontend compilado e assets; executar após build, não substitui E2E |
| `npm run check` | Todas as validações locais acima |

## Docker Compose — ambiente local

O ambiente foi construído e executado com três serviços saudáveis; evidências em [RF-012](docs/tasks/phase-1.md). É necessário Docker Engine Linux ativo. Credenciais padrão são fictícias e exclusivas de desenvolvimento, definidas em `.env.example`. Copie esse arquivo para `.env` se precisar alterar os valores.

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose down
```

Frontend em `http://127.0.0.1:18080`, API em `http://127.0.0.1:3100/api/health` e PostgreSQL em `127.0.0.1:15432`. As portas externas são configuráveis por `WEB_PORT`, `API_PORT` e `POSTGRES_PORT`; as internas são 8080, 3000 e 5432. Os serviços expõem portas apenas em loopback. O volume PostgreSQL é preservado por `down`; não usar `down -v` para um ambiente com dados a conservar. Pare os containers antes de iniciar os servidores locais nas mesmas portas.

A API inicial não utiliza o banco. Migrations, seeds e integração serão entregues com as tasks de persistência e autenticação; não há comandos fictícios para essas etapas.

## Estrutura

- `apps/web`: React/Vite.
- `apps/api`: NestJS/REST.
- `packages/domain`: valores, datas e contratos sem frameworks.
- `docs`: arquitetura, domínio, decisões, tasks e evidências.
- `scripts`: verificações de manutenção do repositório.

CI definida em `.github/workflows/ci.yml`; sua presença não significa que já executou no GitHub. Não há licença de distribuição escolhida ainda. Não versionar arquivos financeiros pessoais ou segredos.
