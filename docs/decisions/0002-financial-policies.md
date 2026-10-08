# ADR-0002 — Políticas financeiras iniciais

- Data: 2026-10-08
- Estado: aceita pelo usuário em respostas explícitas

## Contexto e decisão

O usuário confirmou:

1. Valor bruto da despesa consome o orçamento. Reembolsos esperados ficam separados; não liberam orçamento por antecipação.
2. Recorrências nos dias 30/31 inexistentes usam o último dia do mês. Não deslocar automaticamente por dia útil na V1.
3. Contabilização inicial em BRL.
4. Planejamento mensal pela competência da fatura, mantendo visão de caixa separada.

## Consequências

Não tratar recebíveis como dinheiro disponível. Preservar o dia âncora da recorrência (31 → fevereiro → 31 em março), sem deriva após um mês curto. Preservar moeda e valor originais quando fornecidos, mas exigir valor liquidado em BRL para contabilização. Não somar pagamento de fatura como nova despesa.

Na perspectiva de orçamento bruto aprovada, o recebimento de reembolso afeta caixa e custo pessoal líquido, sem reduzir o gasto bruto da categoria. Isso mantém a definição escolhida pelo usuário; eventuais mudanças para orçamento líquido exigiriam nova decisão.

As regras operacionais e exemplos ficam em [domínio](../domain.md) e as invariantes em [contratos](../contracts.md). Outras questões ficam na [lista de pendências](pending.md).
