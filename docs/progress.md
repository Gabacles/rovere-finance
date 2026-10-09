# Progresso e ponto de retomada

Atualizado em 08/10/2026. Estados, critérios e evidências pertencem às [tasks](tasks/README.md).

## Contexto e revisão

Arquitetura geral e execução incremental aprovadas. Orçamento bruto, recorrências no último dia de meses curtos, BRL e competência da fatura com caixa separado permanecem aprovados. BIZ-03 já foi resolvida na RF-015: competência confirmada obrigatória antes de gravar cobranças; incompletas permanecem na revisão. [ADRs](decisions/README.md).

RF-000/RF-001 e RF-010 a RF-013 permanecem concluídas após inspeção da documentação, primitivas, manifests, identidade, autorização, migrations e testes. Sem problemas relevantes que exijam reimplementação. A base da main ainda não continha a decomposição RF-015 a RF-018 nem a decisão BIZ-03; esses registros foram sincronizados nesta retomada, preservando a distinção entre branches.

RF-015 revisada no commit `103cc00`: `npm run check` aprovado com 79 testes, 27 documentos/11 tasks, tipos, builds e smoke HTTP. Continua na branch `feat/rf-015-import-parsers`, fora de `origin/main`. [Implementação nessa versão](https://github.com/Gabacles/rovere-finance/tree/103cc00/packages/importers). Não confundir esses 79 testes com a base da RF-016, que ainda não inclui os parsers.

## Entrega atual

RF-016 concluída na branch `feat/rf-016-import-destinations`, criada de `origin/main` atualizada em `c167e95`, sem merge na main. Implementados crédito, cartões físicos/virtuais/adicionais compartilhados, competências manuais explícitas, relações SQL por proprietário e seleção de destinos. [Contrato e limites](destinations.md), [task e evidências](tasks/phase-1.md).

`npm run check` passou com 47 testes unitários, tipos, builds, smoke HTTP e documentação. Também passaram 18 testes de integração PostgreSQL/Mailpit e duas jornadas Chromium, incluindo descarte de resposta atrasada na seleção; layout móvel inspecionado. Docker reconstruído com instalação limpa, quatro serviços saudáveis e migration finalizada; volume preservado. Schema versus banco sem diferenças; proxy público 200 e destino privado 401 sem sessão. [Comandos completos e limitações](tasks/phase-1.md). Não há upload, revisão persistida, confirmação financeira, movimentos, saldo ou limite.

## Versionamento e ambiente

`git fetch origin` confirmou RF-013 integrada via PR #1 e RF-015 ainda fora da main. RF-016 não depende do código de parsers; reutiliza a decisão já aprovada do ADR-0005. Entrega preparada para revisão na sua branch, com diff/checks conferidos; commit/push seguem o fluxo AGENTS. Não integrar branches automaticamente à main.

Serviços ativos: PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP local 11025 e Mailpit `http://127.0.0.1:18025`. Sem usuários predefinidos; cadastrar/confirmar pela interface. Testes criam schemas próprios em `rovere_test`, sem reset do banco de desenvolvimento. Para parar preservando volume: `docker compose down`.

BIZ-02, BIZ-04 e BIZ-05 continuam abertas; RF-016 não implementa comportamentos dependentes. [Pendências](decisions/pending.md). CI existente cobre check, integração e Chromium; resultado remoto desta entrega ainda não verificado.

## Próxima ação concreta

1. Revisar/integrar RF-015 e RF-016; verificar main atualizada antes de criar a branch seguinte.
2. RF-017: upload privado CSV/OFX, tarefa recuperável e revisão persistida/versionada com destino/período explícitos.
3. RF-018: confirmação transacional, conciliação e aceite de 500 compras por formato. RF-014 permanece em andamento; parsers e destinos não concluem a importação vertical.
