# Despesas e assinaturas recorrentes — RF-031

P3-04 aprovada expressamente pelo usuário em 15/10/2026. [ADR-0018](decisions/0018-explicit-recurring-expenses.md). Previsão, despesa econômica, cobrança e caixa são distintos. Esta fatia não entrega orçamento, indicadores consolidados ou liquidação bancária de despesa própria.

## Previsão e ciclo de vida

Reutiliza calendário mensal fixo, uma âncora, vigência inclusiva e intervalo finito de até 120 meses por comando, com prévia e confirmação explícita. O intervalo seleciona competências de **planejamento**, não competências de fatura, data efetiva ou data de caixa. Dia inexistente usa o último dia do mês sem perder a âncora. Não há job, geração automática ou preenchimento de lacunas ao retomar. Datas civis e dinheiro BRL usam as primitivas puras existentes; centavos inteiros, sem ponto flutuante.

`ExpenseRecurrence` tem revisões imutáveis por competência. `ExpenseOccurrence` tem identidade única por regra/competência, evidência original da geração e previsão atual versionada. Alterar programação futura preserva passadas (data prevista até hoje em America/Sao_Paulo), corrigidas individualmente, canceladas e já registradas. Revisão posterior já programada também é preservada. Fora da nova vigência não apaga previsão existente. Correção individual pode ajustar previsão passada sem mudar sua competência original. Cancelamento individual é definitivo e não permite gerar de novo a mesma competência.

Pausa bloqueia geração; retomada somente reabilita geração explícita. Cancelar série é definitivo, preservando todas as ocorrências. Ocorrências ainda previstas admitem confirmação/correção individual mesmo após cancelar a série. Não apaga compras, cobranças, faturas ou movimentos.

## Confirmar fato econômico

Uma ação explícita confirma **uma única Expense**: `record` cria despesa com descrição, data original efetiva e total conhecidos; `link` seleciona despesa própria já existente com esses fatos confirmados e versão atual. Nenhum campo efetivo é copiado da previsão. Valor diferente é permitido e a diferença efetivo menos previsto é calculada no domínio. Zero confirmado é valor conhecido, não pagamento. Despesa incompleta exige completar seus fatos no fluxo de Compras antes do vínculo.

Relação tipada por proprietário e unicidade impedem usar a mesma despesa para duas ocorrências. Link registra também histórico/versão da Expense; criação e ambos os journals são atômicos. Resposta da ocorrência contém a referência ao mesmo fato, seus valores atuais e snapshot da última confirmação. Não soma previsão registrada + despesa + cobranças como novos consumos; não publica totais agregados que misturem essas dimensões.

Correções posteriores da data/total da Expense são conservadas. Leitura deriva `reviewRequired` comparando fatos atuais e última confirmação; desconhecido continua desconhecido. `review` com prévia, versão atual da despesa e confirmação explícita atualiza o snapshot; decisões anteriores permanecem no journal. Não cria outra despesa nem desfaz correções/importações. Estornos e cobranças continuam sendo evidências separadas da compra, com suas guardas existentes. Cancelamento/desvinculação de ocorrência registrada não está habilitado nesta fatia: dependência exige revisão, sem apagar fato econômico. A série pode ser cancelada preservando esse vínculo.

Assinatura de cartão usa os vínculos explícitos de [Compras](purchases.md); CSV/OFX e suas identidades/evidências não são alterados. Competência de cobrança continua confirmada pelo fluxo existente. Despesa sem cartão não recebe cartão ou terceiro fictício. Todas as ocorrências retornam `settlement: not_supported`: pagamento de fatura não prova a liquidação individual da assinatura. Não há criação de BankEntry, cobrança, fatura ou pagamento neste módulo.

## HTTP executável

Sessão própria, Origin confiável, JSON e respostas privadas/no-store. Prefixo `/api/expense-recurrences`:

| Rota | Contrato |
|---|---|
| `POST /` | Descrição/notas, valor fixo BRL, âncora 1–31, início e fim explícito (`null` sem fim); só cadastra regra |
| `GET /?page=1`, `GET /:id` | Regras paginadas em 25 e detalhe com estado/revisões |
| `GET /:id/occurrences?page=1` | Ocorrências em 25, competência original, previsão, fato vinculado, diferença e revisão |
| `GET /:id/history` | Últimas 20 decisões; journal integral preservado no banco |
| `POST /:id/preview` | Operação abaixo; leitura consistente sem gravação, devolve versões e hash |
| `POST /:id/confirm` | `{operation, expectedVersion, expectedOccurrenceVersion?, previewHash, confirmed:true}`; versão da ocorrência obrigatória nas ações individuais, recusada nas ações de série |

Operações: `generate` com `fromPeriod/toPeriod`; `edit_series` com `fromPeriod/input` (descrição/notas, valor, âncora, fim); `pause`, `resume`, `cancel_series`; `edit_occurrence` com occurrenceId e input (descrição/notas, data/valor previstos); `cancel_occurrence`; `record` com occurrenceId e expense (descrição/notas, facts.purchasedOn/total); `link` com occurrenceId/expenseId/expectedExpenseVersion; `review` com occurrenceId/expectedExpenseVersion.

Criar regra e confirmar exigem Idempotency-Key de 1–100 caracteres alfanuméricos, `_`/`-`, namespace único deste módulo por usuário. Mesma chave/dados normalizados recupera snapshot original, inclusive após restart/correções posteriores; chave com outros dados retorna 409. Prévia não usa chave e não grava. Confirmação revalida hash, versões, estado, dia atual, fatos e exclusividade sob a mesma trava User usada por importações/compras. Mudança de fatos da despesa invalida a prévia mesmo sem mudar a versão da regra. Falha de qualquer journal desfaz tudo. 404 não revela dados de outro usuário. Constraints SQL protegem FKs, unicidade, valores, datas e evidências; originais/journals não podem ser apagados ou reescritos.

UI funcional inclui cadastro, geração finita, ações de série/ocorrência, seleção paginada de despesa, prévia com diferença, confirmação, revisão e histórico. Validação monetária perceptível usa o componente compartilhado RF-030. Resposta perdida conserva corpo/versões/chave enquanto a tela estiver montada e oferece recuperação; após replay lê o estado atual. Não representa aceite visual da V1: reformulação de navegação/apresentação permanece obrigatória em [UX](ux.md).
