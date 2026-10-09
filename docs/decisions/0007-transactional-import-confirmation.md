# ADR-0007 — Confirmação transacional e identidades tipadas

- Data: 09/10/2026.
- Estado: aceita na implementação incremental autorizada.
- Contexto: RF-018 precisa transformar revisão persistida em fatos financeiros sem duplicar reimportações, inferir compras completas ou perder correções manuais.
- Decisão: movimentos/cobranças separados, identidades externas e vínculos de origem com FKs tipadas; confirmação única por lote, idempotência por usuário/comando e serialização inicial por proprietário. Semelhança gera revisão explícita; fatos existentes não são sobrescritos. [Contrato atual](../import-confirmation.md).
- Consequências: rollback integral e replay após resposta perdida são verificáveis em PostgreSQL; tipos mantêm conhecimento parcial. A serialização reduz complexidade inicial, com custo de throughput por usuário a medir. Ciclo/pagamentos, ajustes/reversões e políticas pendentes não são antecipados. Remover bytes brutos não apaga fatos ou origem normalizada.
