# ADR-0012 — Bases e alocações explícitas de pagamentos de fatura

- Estado: aceita na continuidade autorizada em 09/10/2026, sob delegação das recomendações para a v0.
- Contexto: total declarado pode divergir do calculado, pagamentos podem aparecer em duas origens e saldo anterior pode repetir obrigação entre competências.
- Decisão: base e saída bancária explicitamente confirmadas, alocações tipadas/versionadas/idempotentes, saldo derivado somente de reservas ativas, com trava por proprietário e revalidação transacional. [Contrato canônico](../statement-payments.md).
- Consequências: não há pagamento/consumo duplicado, juros presumidos ou compensação automática de divergências. Saldo anterior identificado exige revisão fora desta fatia; mudanças de contexto preservam alocações e pedem reconfirmação. Reversão libera reserva sem apagar movimento/histórico.
