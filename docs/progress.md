# Progresso e ponto de retomada

Atualizado em 09/10/2026. Estados, critérios e comandos nas [tasks](tasks/README.md).

## Entrega atual

Entrega 1 concluída na RF-014/RF-018 e integrada pelo usuário via [PR #6](https://github.com/Gabacles/rovere-finance/pull/6), main `d3831c8`. CI de push/PR aprovada no head `1441db7`; código/merge conferidos, sem refazer trabalho validado. CSV e OFX seguem executáveis e obrigatórios na V1.

Fase 2 detalhada em RF-020 a RF-025. RF-020 concluída na branch `feat/rf-020-statement-facts`, criada dessa main: datas de fechamento/vencimento, total declarado e ciclo informado, com estado de conhecimento, histórico imutável e edição por versão/proprietário. Faturas existentes não receberam datas, total zero ou ciclo aberto presumidos; competência, cobranças e pagamento não são alterados. [Contrato](card-statements.md), [fase 2](tasks/phase-2.md) e [ADR-0008](decisions/0008-explicit-statement-facts.md).

## Validação executada

`npm run check`: 35 documentos/17 tasks e hash histórico, tipos, 93 unitários, builds e smoke aprovados. Integração: 49 aprovados, incluindo isolamento, versão concorrente, rollback, histórico, zero versus unknown e importação histórica em ciclo fechado. Chromium: 6 jornadas, com dados de fatura/reload/conflito e os fluxos CSV/OFX de 500 registros; captura móvel inspecionada.

Docker atualizado, quatro serviços saudáveis, quinta migration aplicada sem reset; schema/banco sem diferenças; proxy público 200 e fatura privada 401 sem sessão. Falhas/ajustes e comandos na task RF-020. CI remota desta nova branch ainda não verificada; resultados anteriores mantidos nas tasks de suas versões.

## Próxima ação concreta

1. Revisar/integrar RF-020, conferir CI e main atualizada antes de criar nova branch; sem merge automático na main.
2. RF-021: compra manual completa/parcial e associação explícita de cobranças conhecidas, sem deduzir total ou data original de parcela importada.
3. RF-022 a RF-025: planos/previsões, natureza/totais calculados, pagamentos/alocações e ajustes/estornos, detalhados ao iniciar cada task. A V1 ainda não está concluída.

## Decisões abertas e ambiente

BIZ-02: rotativo/renegociação/encargos (recomendação: valores informados, sem juros presumidos); BIZ-04: layouts bancários prioritários (recomendação: arquivos realmente usados, mantendo CSV/OFX genéricos); BIZ-05: excedente de reembolso após estorno (recomendação: revisão explícita do recebível/eventual devolução, sem ajuste silencioso). [Questões e bloqueios](decisions/pending.md). BIZ-01/BIZ-03 já resolvidas; não repetir aprovação.

Serviços ativos: PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP 11025 e Mailpit 18025. Volume preservado; testes só em schemas próprios de `rovere_test`. Sem usuários predefinidos ou envio externo. [README](../README.md).
