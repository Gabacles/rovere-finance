# Progresso e ponto de retomada

Atualizado em 08/10/2026. Fonte dos estados e evidências: [tasks](tasks/README.md).

## Contexto confirmado

Arquitetura geral aprovada e execução incremental autorizada. O usuário também aprovou orçamento bruto, recorrências ajustadas ao último dia, BRL e competência da fatura com caixa separado. [ADRs](decisions/README.md).

## Entrega atual

Fase 0 concluída: documentação por assunto, arquivo original integral preservado, ADRs, contratos e invariantes definidos ([RF-000/RF-001](tasks/phase-0.md)).

Base local e Docker validados: workspaces React/Vite, NestJS e domínio; página informativa; liveness HTTP; primitivas exatas de dinheiro, distribuição de centavos e datas ancoradas; containers da API, frontend e PostgreSQL ([RF-010/RF-011/RF-012](tasks/phase-1.md)).

## Versionamento

Em 08/10/2026, o usuário configurou `origin` para `https://github.com/Gabacles/rovere-finance.git` e autorizou commits semânticos em inglês, sem assinatura ou coautoria do agente. A base foi organizada em commits de documentação, aplicação e ambiente/CI; consultar `git log --oneline` para os identificadores. O envio ao remote não foi executado nesta etapa.

Autenticação, migrations, conexão da API ao banco, movimentações, orçamento e importadores ainda não existem. O suporte CSV/OFX continua obrigatório, mas não está implementado nesta fundação. Tipos de importação não são parsers.

## Validação executada em 08/10/2026

- `npm run docs:check`: links, 7 tasks e SHA-256 do arquivo histórico verificados.
- `npm run typecheck`: workspaces aprovados.
- `npm test`: 42 testes em 3 arquivos aprovados, incluindo HTTP real da API.
- `npm run build`: domínio, API e frontend compilados.
- `npm run smoke:web`: HTML e 2 assets compilados servidos por HTTP; não é teste de renderização/E2E.
- `docker compose config --quiet`: configuração válida.
- `docker compose up --build -d --wait --wait-timeout 90`: imagens construídas e três serviços healthy.
- HTTP do frontend, API direta e API via proxy: respostas corretas; consulta SQL no PostgreSQL retornou banco `rovere` e valor de controle `1`.
- `docker compose down`: serviços do Rovere encerrados, mantendo o volume.
- Auditoria na instalação: nenhuma vulnerabilidade conhecida reportada.

Falha inicial de configuração de tipos Node foi corrigida e revalidada. CI foi preparada, mas ainda não executou no GitHub. Detalhes e links de implementação ficam nas tasks.

## Ambiente e ocorrências resolvidas

Docker Desktop estava desligado e foi iniciado pela CLI. Portas padrão estavam ocupadas; Rovere usa portas externas 15432 (PostgreSQL), 3100 (API) e 18080 (web), configuráveis. Serviços existentes não foram interrompidos. Ao encerrar a validação, os containers do Rovere foram parados com `docker compose down`, preservando o volume. Docker Desktop permanece ativo.

Não há bloqueio de ambiente conhecido para a próxima task. Existem decisões financeiras pendentes, listadas separadamente, que não bloqueiam a autenticação.

## Próxima ação concreta

1. Iniciar RF-013: detalhar identidade, persistência inicial e isolamento por usuário antes de aceitar arquivos financeiros; subir ambiente com `docker compose up -d --wait`.
2. Verificar migrations e autorização com PostgreSQL real, sem apagar o volume para contornar falhas.
3. Decompor RF-014 ao se aproximar: CSV e OFX no mesmo marco, com revisão e idempotência reais em banco.

Consultar [decisões pendentes](decisions/pending.md) antes de qualquer regra dependente. Não confundir o scaffolding com a entrega 1 completa. A próxima sessão deve inspecionar código e testes antes de confiar neste resumo.
