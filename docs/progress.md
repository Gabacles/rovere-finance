# Progresso e ponto de retomada

Atualizado em 09/10/2026. Estados, critérios e comandos nas [tasks](tasks/README.md).

## Entrega atual

RF-000/RF-001 e RF-010 a RF-018 concluídas. RF-014 passou no aceite vertical CSV e OFX: upload privado, revisão persistida, confirmação atômica/idempotente, decisões de correspondência e reimportação sem duplicar efeitos. Isso conclui a entrega 1, sem declarar a V1 completa. [Roadmap](roadmap.md).

PR #5 da RF-017 integrado com autorização explícita em main `f986fac`, após CI de push/PR aprovada no head `07ae108`. A interrupção anterior foi revogada pelo usuário ao retomar RF-018. Branch `feat/rf-018-import-confirmation` criada dessa main atualizada e preparada para revisão; não integrada automaticamente à main.

RF-018 implementa BankEntry/CardCharge separados, identidades externas com escopo e FKs de usuário/conta/crédito, vínculos de origem tipados, prévia e decisões explícitas por linha/em lote, confirmação transacional e consulta própria. Registros existentes e conhecimento parcial são preservados. [Contrato e limites](import-confirmation.md), [ADR-0007](decisions/0007-transactional-import-confirmation.md).

## Validação executada

`npm run check`: 32 documentos/11 tasks, hash histórico, tipos, 88 unitários, builds e smoke aprovados. Integração: 41 aprovados, com 500 compras por formato, dois usuários, concorrência, rollback, reenvio/restart e conflitos. Chromium: 5 jornadas, incluindo confirmação/reimportação CSV e OFX de 500 compras cada, resposta perdida após commit e conciliação explícita; captura móvel inspecionada.

Docker atualizado, quatro serviços saudáveis, quarta migration aplicada sem reset; schema e banco sem diferenças. Proxy público 200 e consulta financeira 401 sem sessão. Resultados/comandos e falhas corrigidas estão na task RF-018. [CI de push](https://github.com/Gabacles/rovere-finance/actions/runs/37941646330) aprovada na implementação `a895f80`; [PR #6](https://github.com/Gabacles/rovere-finance/pull/6) aberto. Conferir CI/head atualizado do PR antes do merge; resultados RF-017 permanecem atribuídos ao head anterior.

## Próxima ação concreta

1. Revisar/integrar a branch RF-018 e verificar CI/main atualizada antes de iniciar nova branch. Cada entrega segue o fluxo de revisão, sem merge automático na main.
2. Detalhar fase 2: compras manuais, planos/calendário explícitos, ciclo de faturas e pagamentos. Não inferir compra completa, parcelas, vencimento, saldo ou limite ausentes.
3. Antes de financiamento/renegociação, resolver BIZ-02; layouts bancários específicos e excesso de reembolso continuam nas pendências correspondentes. CSV/OFX já executáveis permanecem obrigatórios e independem de Open Finance.

## Ambiente e limites

Serviços ativos: PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP 11025 e Mailpit 18025. Docker estava desligado na retomada e foi iniciado pela CLI. Volume preservado; testes apenas em schemas próprios de `rovere_test`. Sem usuários predefinidos ou envio externo. [README](../README.md).

Sem saldos calculados, limites, indicadores de consumo, pagamentos, orçamento ou retenção automática presumidos. Dados originais privados; bytes de lotes confirmados podem ser removidos explicitamente sem apagar finanças/proveniência normalizada. BIZ-03 resolvida; BIZ-02/BIZ-04/BIZ-05 abertas. [Pendências](decisions/pending.md).
