# Progresso e ponto de retomada

Atualizado em 08/10/2026. Fonte dos estados e evidências: [tasks](tasks/README.md).

## Contexto confirmado

Arquitetura geral aprovada e execução incremental autorizada. O usuário também aprovou orçamento bruto, recorrências ajustadas ao último dia, BRL e competência da fatura com caixa separado. [ADRs](decisions/README.md).

BIZ-03 resolvida nesta entrega: linhas de cartão sem competência permanecem na revisão; gravação financeira exige período informado e confirmado. [ADR-0005](decisions/0005-missing-statement-period.md).

## Entrega atual

Fase 0 concluída: documentação por assunto, arquivo original integral preservado, ADRs, contratos e invariantes definidos ([RF-000/RF-001](tasks/phase-0.md)).

RF-010 a RF-013 concluídas: workspaces React/Vite, NestJS e domínio; primitivas exatas de dinheiro/datas; PostgreSQL e migrations; cadastro com confirmação de email, login/logout, recuperação, sessões persistidas e contas mínimas isoladas por usuário. [Tasks e evidências](tasks/phase-1.md), [identidade](identity.md) e [ADR-0004](decisions/0004-identity-persistence.md).

RF-014 decomposta em RF-015 (parsers), RF-016 (destinos), RF-017 (upload/revisão persistida) e RF-018 (confirmação/aceite vertical). RF-015 concluída: CSV configurável e OFX bancário/cartão 1.x/2.x, centavos exatos, evidência original, sugestões separadas e erros por linha. [Catálogo homologado](import-formats.md). A biblioteca ainda não está conectada à API/UI.

## Versionamento

RF-013 foi integrada pelo usuário via PR #1; `origin/main` conferida em `c167e95`. A branch `feat/rf-015-import-parsers` foi criada dessa main atualizada. Commits semânticos em inglês, identidade Git do usuário e sem assinatura/coautoria do agente. Verificar tracking/merge antes de iniciar a próxima branch; não integrar automaticamente à main.

Movimentações, cartões, orçamento, upload e confirmação de importações ainda não existem. CSV/OFX continuam obrigatórios na mesma entrega e independem de Open Finance. Parsing de 500 registros não equivale a confirmar 500 compras em banco; RF-014 permanece em andamento.

## Validação executada em 08/10/2026

- `npm run docs:check`: 27 documentos, links, 11 tasks e SHA-256 do arquivo histórico verificados.
- `npm run typecheck`: workspaces aprovados.
- `npm test`: 79 testes aprovados, incluindo 34 de parsing (fixtures e variantes banco/cartão, 500 registros por formato, limites e casos adversos).
- RF-013: 10 testes de integração e jornada Chromium previamente aprovados; mesmos arquivos de autenticação no merge, não repetidos nesta subtask de parsers.
- `npm run build`: domínio, importadores, API e frontend compilados.
- `npm run smoke:web`: HTML e 2 assets compilados servidos por HTTP; não é teste de renderização/E2E.
- `docker compose config --quiet`: configuração válida.
- `docker compose up --build -d --wait --wait-timeout 120`: imagens construídas, quatro serviços saudáveis e migração concluída (exit 0); reexecução preservou dados.
- HTTP via proxy: frontend, liveness e readiness retornaram 200; recurso privado sem sessão retornou 401.
- `npm audit` e auditoria de produção: nenhuma vulnerabilidade conhecida reportada após correções transitivas.

CI inclui o novo workspace no check automático e mantém integração/Chromium. Resultado remoto desta branch ainda não verificado. Comandos e limitações de cada entrega estão nas tasks.

## Ambiente e ocorrências resolvidas

Docker Desktop ativo. Serviços Rovere deixados ativos: PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP local 11025 e Mailpit `http://127.0.0.1:18025`. Portas padrão ocupadas por serviços alheios não foram alteradas. Para parar preservando volume: `docker compose down`. Testes usam schemas próprios em `rovere_test`, sem tocar no banco de desenvolvimento. Não há credenciais de usuários pré-criadas; cadastro e confirmação disponíveis na interface/Mailpit.

Docker estava desligado nesta retomada e foi iniciado pela CLI para validar o novo workspace. A implantação pública ainda exige configuração operacional documentada em identidade. BIZ-02, BIZ-04 e BIZ-05 permanecem abertas; nenhuma regra dependente foi inferida.

## Próxima ação concreta

1. Revisar RF-015 e verificar o merge antes de criar branch da RF-016 a partir da main atualizada.
2. RF-016: detalhar schema/contratos de conta de crédito, cartão e fatura; implementar destinos autorizados sem presumir saldo ou limite.
3. Depois: RF-017 e RF-018, para revisão persistida e confirmação transacional de CSV/OFX. Reusar autorização por proprietário e testar arquivos/lotes entre usuários. Aplique BIZ-03/ADR-0005, sem repetir a pergunta já respondida.

Consultar [decisões pendentes](decisions/pending.md) antes de qualquer regra dependente. Não confundir o scaffolding com a entrega 1 completa. A próxima sessão deve inspecionar código e testes antes de confiar neste resumo.
