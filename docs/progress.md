# Progresso e ponto de retomada

Atualizado em 09/10/2026. Estados, critérios e evidências nas [tasks](tasks/README.md).

## Entrega atual

Entrega 1 RF-014/RF-018 integrada pelo usuário via [PR #6](https://github.com/Gabacles/rovere-finance/pull/6). RF-020 integrada via [PR #7](https://github.com/Gabacles/rovere-finance/pull/7), main `d3ac1bf`; CI de push/PR aprovada no head `01a19a3`. Código/merge conferidos, mantendo trabalho validado e CSV/OFX obrigatórios.

RF-021 concluída localmente na branch `feat/rf-021-manual-purchases`, criada da main atualizada: compra manual completa/parcial, edição versionada, vínculo/desvínculo explícito de cobranças próprias, idempotência persistida e histórico imutável. Associar parcela não inventa total/data original, não duplica importação nem altera correções. [Compras](purchases.md), [fase 2](tasks/phase-2.md).

## Validação executada

`npm run check`: 38 documentos/17 tasks e hash histórico, tipos, 97 unitários, builds e smoke aprovados. Integração: 59 aprovados (10 RF-021). Chromium: 7 jornadas, incluindo criação com resposta perdida, associação posterior à importação, conflito/reload/histórico/desassociação e regressões CSV/OFX de 500 registros. Duas capturas móveis inspecionadas. Comandos, limites e ajustes na task RF-021; resultados anteriores preservados nas tasks de suas versões.

Docker atualizado, quatro serviços saudáveis, sexta migration aplicada sem reset; schema/banco sem diferenças; proxy público 200 e compras privadas 401 sem sessão. Implementação `776cdc1` publicada no [PR #8](https://github.com/Gabacles/rovere-finance/pull/8); CI push/PR aprovada no head `e618912`, links na task. Registro final somente de documentação preserva a implementação validada; conferir head atual antes de integrar.

## Próxima ação concreta

1. Revisar [PR #8](https://github.com/Gabacles/rovere-finance/pull/8) da RF-021 para main; conferir head/CI e autorização específica antes de integrar.
2. Após integração, RF-022: plano de parcelas e previsões com total, quantidade e calendário explicitamente confirmados; reutilizar distribuição exata existente.
3. RF-023 a RF-025: natureza/totais calculados, pagamentos/alocações e ajustes/estornos. A V1 ainda não está concluída.

## Políticas e ambiente

BIZ-02/BIZ-04/BIZ-05 resolvidas por delegação do usuário em 09/10/2026: encargos informados sem juros presumidos, CSV/OFX genéricos até layouts reais comprovados, revisão explícita de excedentes de reembolso. [Políticas](v0-policies.md), [ADR-0009](decisions/0009-v0-business-policies.md). BIZ-01/BIZ-03 preservadas. Sem decisões BIZ bloqueantes nesses limites; retenção continua proposta técnica/de privacidade.

Serviços ativos: PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP 11025 e Mailpit 18025. Volume preservado; testes só em schemas próprios de `rovere_test`. Sem usuários predefinidos ou envio externo. [README](../README.md).
