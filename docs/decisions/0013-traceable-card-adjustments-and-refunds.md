# ADR-0013 — Ajustes rastreáveis e excedente após estorno

- Estado: aceita na continuidade autorizada em 09/10/2026, sob delegação das recomendações para a v0.
- Contexto: estornos podem afetar compra, fatura e pagamentos já reais; apagar fatos ou liberar saída paga para fazer coincidir a nova base perderia rastreabilidade.
- Decisão: ajustes informados imutáveis, reversão compensatória tipada e associação explícita de estorno à compra, com limites, versões e histórico. Base abaixo de pagamentos admite reconfirmação explícita preservando reservas, com excedente para revisão. [Contrato canônico](../card-adjustments.md).
- Consequências: total/plano/correções não mudam silenciosamente; não nasce dinheiro livre, reembolso ou obrigação de devolução. Complementa ADR-0012 na regra de revisão abaixo do já alocado. Saldo anterior/financiamento e módulos de terceiros permanecem limites explícitos da v0.
