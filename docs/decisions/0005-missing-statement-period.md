# ADR-0005 — Confirmação exige competência da fatura

- Data: 08/10/2026.
- Estado: aceita por resposta explícita do usuário durante a RF-015.
- Contexto: BIZ-03 apresentava duas opções para arquivos de cartão sem período de fatura.
- Decisão: manter as linhas na revisão, sem gravação financeira, até informar e confirmar a competência. O usuário escolheu “Exigir período antes de confirmar”. Regra operacional em [importação](../imports.md).
- Consequências: salvar/reabrir a revisão é independente de confirmar lançamentos. A interface deverá permitir selecionar o período em lote, apontar as linhas pendentes e distinguir intervalo do extrato de competência. Não criar cobranças financeiras sem fatura como atalho. Linhas excluídas explicitamente da seleção não impedem confirmar as demais válidas.
