# Progresso e ponto de retomada

Atualizado em 08/10/2026. Fonte dos estados e evidências: [tasks](tasks/README.md).

## Contexto confirmado

Arquitetura geral aprovada e execução incremental autorizada. O usuário também aprovou orçamento bruto, recorrências ajustadas ao último dia, BRL e competência da fatura com caixa separado. [ADRs](decisions/README.md).

## Entrega atual

Fase 0 concluída: documentação por assunto, arquivo original integral preservado, ADRs, contratos e invariantes definidos ([RF-000/RF-001](tasks/phase-0.md)).

RF-010 a RF-013 concluídas: workspaces React/Vite, NestJS e domínio; primitivas exatas de dinheiro/datas; PostgreSQL e migrations; cadastro com confirmação de email, login/logout, recuperação, sessões persistidas e contas mínimas isoladas por usuário. [Tasks e evidências](tasks/phase-1.md), [identidade](identity.md) e [ADR-0004](decisions/0004-identity-persistence.md).

## Versionamento

Em 08/10/2026, o push inicial da `main` foi concluído em `https://github.com/Gabacles/rovere-finance.git` (base até `f73b755`). A RF-013 foi desenvolvida na branch `feat/rf-013-authentication`, destinada à revisão antes do merge. Commits semânticos em inglês, identidade Git do usuário e sem assinatura/coautoria do agente. Conferir `git status -sb`, `git log` e tracking remoto ao retomar; nunca presumir que a branch foi integrada à main.

Movimentações, cartões, orçamento e importadores ainda não existem. O suporte CSV/OFX continua obrigatório na V1 e independe de Open Finance. Cadastro mínimo de contas não representa saldos ou integração bancária; tipos de importação não são parsers.

## Validação executada em 08/10/2026

- `npm run docs:check`: 25 documentos, links, 7 tasks e SHA-256 do arquivo histórico verificados.
- `npm run typecheck`: workspaces aprovados.
- `npm test`: 45 testes unitários aprovados.
- `npm run test:integration`: 10 testes contra PostgreSQL real e SMTP local aprovados.
- `npm run test:e2e`: jornada completa Chromium aprovada; screenshot móvel inspecionado.
- `npm run build`: domínio, API e frontend compilados.
- `npm run smoke:web`: HTML e 2 assets compilados servidos por HTTP; não é teste de renderização/E2E.
- `docker compose config --quiet`: configuração válida.
- `docker compose up --build -d --wait --wait-timeout 120`: imagens construídas, quatro serviços saudáveis e migração concluída (exit 0); reexecução preservou dados.
- HTTP via proxy: frontend, liveness e readiness retornaram 200; recurso privado sem sessão retornou 401.
- `npm audit` e auditoria de produção: nenhuma vulnerabilidade conhecida reportada após correções transitivas.

CI ampliada com PostgreSQL, Mailpit, integração e Chromium. Resultado remoto desta branch ainda não verificado. Falhas resolvidas, comandos e limites da entrega estão registrados na RF-013.

## Ambiente e ocorrências resolvidas

Docker Desktop ativo. Serviços Rovere deixados ativos: PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP local 11025 e Mailpit `http://127.0.0.1:18025`. Portas padrão ocupadas por serviços alheios não foram alteradas. Para parar preservando volume: `docker compose down`. Testes usam schemas próprios em `rovere_test`, sem tocar no banco de desenvolvimento. Não há credenciais de usuários pré-criadas; cadastro e confirmação disponíveis na interface/Mailpit.

Não há bloqueio de ambiente conhecido. A implantação pública ainda exige configuração operacional documentada em identidade. Decisões financeiras pendentes permanecem abertas; nenhuma foi inferida nesta entrega.

## Próxima ação concreta

1. Revisar RF-013 e verificar o estado do merge antes de criar a próxima branch a partir da main atualizada.
2. Decompor RF-014: destinos de contas/cartões, upload privado, staging, CSV e OFX no mesmo marco, revisão e idempotência em banco.
3. Apresentar proposta para BIZ-03 (fatura ausente) antes de implementar comportamento dependente; avançar nos contratos/fixtures independentes. Reusar a autorização por proprietário e testar também arquivos/lotes entre usuários.

Consultar [decisões pendentes](decisions/pending.md) antes de qualquer regra dependente. Não confundir o scaffolding com a entrega 1 completa. A próxima sessão deve inspecionar código e testes antes de confiar neste resumo.
