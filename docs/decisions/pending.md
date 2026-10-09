# Decisões de negócio pendentes

As regras aprovadas estão no [ADR-0002](0002-financial-policies.md). Esta lista não bloqueia trabalho técnico independente.

| ID | Questão | Recomendação e motivo | Bloqueia |
|---|---|---|---|
| BIZ-02 | Rotativo, renegociação e encargos | Registrar saldos e encargos informados, sem calcular juros presumidos. | Regras de financiamento de fatura |
| BIZ-04 | Layouts bancários prioritários | Começar pelos arquivos efetivamente utilizados; CSV genérico e OFX 1.x/2.x permanecem obrigatórios. | Homologação de adaptadores específicos; não bloqueia parser genérico |
| BIZ-05 | Reembolso que supera o custo após estorno | Pedir revisão do valor a receber e da eventual obrigação de devolver ao terceiro; não ajustar silenciosamente. | Tratamento do excedente |

BIZ-01 foi resolvida pela escolha de orçamento bruto registrada no ADR-0002: recebimentos aparecem no caixa/custo líquido, sem recompor o orçamento bruto. O ID não será reutilizado.

BIZ-03 resolvida em 08/10/2026: exigir competência confirmada antes de gravar cobranças; manter incompletas na revisão. [ADR-0005](0005-missing-statement-period.md).

Limites de 10 MB/10 mil linhas e retenção de 30 dias são propostas técnicas, ainda sujeitas a medição e política de privacidade. Não apresentá-los como capacidade testada ou obrigação legal.

Quando resolvida, mover a decisão para seu documento canônico e registrar a aprovação/ADR, removendo-a desta lista ativa. Não repetir perguntas já respondidas.
