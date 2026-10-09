# ADR-0008 — Fatos de fatura explícitos e versionados

- Data: 09/10/2026.
- Estado: aceita no escopo incremental autorizado.
- Contexto: RF-018 preserva somente competência de fatura; a fase 2 precisa conhecer fechamento, vencimento, total declarado e ciclo sem inferir liquidação ou substituir cobranças.
- Decisão: fatos opcionais com estado de conhecimento e evidência manual, edição com expectedVersion e histórico atômico/imutável. Faturas existentes continuam sem fatos adicionais até informação explícita. Competência e registros financeiros não são alterados por esse comando. [Contrato canônico](../card-statements.md).
- Consequências: datas/ciclo/declaração podem ser corrigidos sem perder a versão anterior; zero informado é diferente de desconhecido. Fechado não significa pago e não impede importação histórica. Total calculado, natureza das linhas e pagamentos dependem das próximas tasks; BIZ-02 não bloqueia esta fatia.
