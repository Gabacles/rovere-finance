# Fatos explícitos de fatura — RF-020

Faturas já têm crédito próprio e competência manual. Esta entrega acrescenta somente dados informados de fechamento, vencimento, total declarado em BRL e ciclo (`open`/`closed`). Ausência permanece `unknown`; faturas existentes não ganham total zero, datas ou ciclo aberto presumidos.

Fechamento/vencimento são datas civis independentes da competência. Não calcular datas pelo mês, deslocar por dia útil ou derivar ciclo pela data atual. Ciclo informado não significa pago, saldo liquidado ou atraso; estes exigem os módulos financeiros correspondentes. DeclaredTotal preserva o valor com sinal informado, sem compará-lo ou compensá-lo com cobranças nesta fatia.

Edição preserva competência/ID de fatura, crédito, cartões, cobranças, identidades e resultados de importação. Histórico registra versões anterior/nova e correções explícitas. `null` significa remover a afirmação atual e voltar a desconhecido, mantendo a evidência anterior no histórico. Uma fatura informada como fechada ainda pode receber importação histórica; isso não reabre seu ciclo ou atribui pagamento.

## Contrato executável

Sessão obrigatória e proprietário pela sessão; 404 para fatura ausente/alheia ou de outro crédito, inclusive do mesmo usuário. Escritas continuam exigindo Origin confiável e JSON. As rotas antigas de cadastro/lista de competências mantêm a projeção mínima RF-016, sem acrescentar BigInt ao JSON.

| Método e rota | Comportamento |
|---|---|
| `GET /api/credit-accounts/:id/statements/:statementId` | Competência/ID imutáveis, version e facts discriminados; sem owner ou estado presumido de pagamento |
| `PATCH /api/credit-accounts/:id/statements/:statementId` | `expectedVersion` e `facts` parciais; update/histórico na mesma transação; 409 se versão mudou |
| `GET /api/credit-accounts/:id/statements/:statementId/history` | Últimas vinte alterações do próprio usuário, em ordem decrescente, snapshots anterior/atual e instante UTC |

Exemplo:

```json
{
  "expectedVersion": 0,
  "facts": {
    "closingOn": "2026-09-30",
    "dueOn": "2026-11-05",
    "declaredTotal": { "currency": "BRL", "cents": "0" },
    "cycle": "closed"
  }
}
```

Cada campo retorna `unknown` ou `confirmed` com valor/evidência `user` e ID da alteração. Datas: `YYYY-MM-DD`, anos 0001–9999, gregoriano; total: MoneyDTO BRL inteiro canônico de 64 bits, inclusive zero e sinal informado. Campos extras, proprietário, competência, pagamento, previsão e números em ponto flutuante são rejeitados. Não há validação que force datas a pertencer ao mês da competência ou derive uma data da outra.

PATCH exige ao menos um campo; campos omitidos preservam valor/evidência. `null` volta a desconhecido. Versão só avança com histórico gravado; falha reverte ambos. A atualização documental não muda regras financeiras. Históricos possuem FK composta para fatura/crédito/dono e trigger de imutabilidade. SQL distingue campos nulos de fatos conhecidos com evidência; migration adiciona defaults apenas técnicos (version 0/evidência vazia), sem preencher datas/ciclo/total.

A interface permite selecionar uma fatura do crédito, editar dados, recarregar após conflito, consultar histórico e reabrir após reload. Conversão de entrada em reais é exata por texto/BigInt, compartilhada com o importador; cálculos financeiros ficam no domínio/backend. Formulário vazio não cria total zero. Erros não expõem dados financeiros ou stacks. Não há automatismo de ciclo/pagamento pela data atual.

Implementação: [domínio puro](../packages/domain/src/statement-facts.ts), [serviço](../apps/api/src/credit/statements.service.ts), [controller](../apps/api/src/credit/statements.controller.ts), [migration](../apps/api/prisma/migrations/202610090002_statement_facts/migration.sql), [UI](../apps/web/src/statement-facts.tsx). Evidências na [task](tasks/phase-2.md) e contexto no [ADR-0008](decisions/0008-explicit-statement-facts.md).

Total calculado, natureza de linhas, compra agregada/plano, pagamentos, saldo/limite, juros/rotativo e mudanças de competência de cobranças ficam nas próximas tasks. [Domínio](domain.md), [contratos](contracts.md) e [decisões abertas](decisions/pending.md).
