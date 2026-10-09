# Progresso e ponto de retomada

Atualizado em 08/10/2026. Critérios e evidências nas [tasks](tasks/README.md).

## Continuidade

Arquitetura e políticas aprovadas preservadas; BIZ-03 exige competência confirmada antes de gravar cobranças. [ADRs](decisions/README.md). RF-000/RF-001, RF-010 a RF-013, RF-015 e RF-016 concluídas. RF-014 continua em andamento: faltam upload/revisão persistida RF-017 e confirmação financeira RF-018.

Usuário integrou RF-015 pelo PR #2 em `49ec1c9`. RF-016 atualizada com essa main, preservando parsers, crédito/cartões/períodos, migrations e provas de isolamento. Conflitos de documentação e scripts resolvidos; base conjunta validada com `npm run check` (81 testes), `npm run test:integration` (18) e `npm run test:e2e` (2).

A revisão automática rejeitou merge/push na main por exigir autorização explícita e específica conforme AGENTS. Nenhum merge/push na main executado nesta continuidade. Solicitação de autorização pendente; alternativa é o usuário integrar a branch RF-016. A branch atualizada é o resultado concreto preparado para revisão.

## Próxima ação concreta

1. Obter autorização específica para merge/push na main ou o usuário integrar RF-016; então atualizar main e criar `feat/rf-017-import-review`.
2. RF-017: upload privado CSV/OFX, parsing recuperável em worker, origem/revisão persistidas e versionadas, prévia paginada e correções explícitas com destinos autorizados.
3. RF-018: confirmação transacional, conciliação e aceite de 500 compras por formato. Não antecipar gravações financeiras na RF-017.

## Ambiente e limites

Serviços locais: PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP 11025 e Mailpit 18025. Volume preservado; testes em schemas próprios de `rovere_test`. Sem usuários predefinidos ou envio externo. [README](../README.md).

BIZ-02, BIZ-04 e BIZ-05 abertas, sem bloquear revisão genérica. [Pendências](decisions/pending.md). Não há saldos, limites, pagamentos ou movimentos implementados. Resultados das branches anteriores permanecem atribuídos às respectivas versões nas tasks.
