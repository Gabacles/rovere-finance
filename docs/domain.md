# Domínio financeiro

> Arquitetura geral aprovada em 08/10/2026. Este documento define o destino planejado; consulte [progresso](progress.md) e [tasks](tasks/README.md) para saber o que está implementado.

## Modelo conceitual

A separação principal será entre **o fato econômico, sua programação, seu movimento de caixa e a evidência de origem**.

| Grupo | Entidades principais | Relações e regras |
|---|---|---|
| Identidade | `User`, `Session` | Dados financeiros pertencem a um usuário |
| Contas | `Account`, `BalanceSnapshot`, `BankEntry` | Uma conta possui movimentos efetivos e saldos observados em datas determinadas |
| Crédito | `CreditAccount`, `Card`, `Statement` | Vários cartões podem compartilhar a mesma conta de crédito, limite e fatura |
| Compras | `Expense`, `InstallmentPlan`, `CardCharge` | Uma despesa pode originar várias cobranças; cada cobrança pertence a uma fatura quando identificada |
| Pagamentos de fatura | `StatementPaymentAllocation` | Vincula movimento bancário ao valor liquidado de uma ou mais faturas |
| Receitas | `Income`, `IncomeSettlement` | Receita prevista pode ser liquidada por movimentos efetivos |
| Transferências | `Transfer` | Liga saída e entrada entre contas próprias, inclusive quando chegam em importações diferentes |
| Terceiros | `Counterparty`, `Receivable`, `Payable`, `DueItem` | Valores a receber/pagar têm calendários independentes |
| Liquidações de terceiros | `ReceivableSettlement`, `PayableSettlement` | Alocam valores efetivos aos compromissos correspondentes |
| Recorrências | `RecurrenceRule`, `ScheduledOccurrence` | Cada ocorrência é gerada uma única vez |
| Planejamento mensal | `Category`, `Budget`, `BudgetLine` | Categoria principal e orçamento por período |
| Importação | `ImportBatch`, `ImportSourceRecord`, `ImportRow`, `MappingProfile` | Arquivo, registro de origem, interpretação e revisão separados |
| Rastreabilidade | `ExternalIdentity`, `ReconciliationDecision`, vínculos de origem | Um registro financeiro pode ter evidências manuais e importadas |
| Auditoria | `AuditEvent` | Registra mudanças relevantes com acesso restrito |

**A conta de crédito é diferente do cartão físico.** Essa distinção resolve cartões virtuais e adicionais que compartilham fatura e limite.

RF-016 implementa somente cadastros mínimos de crédito, cartões compartilhados e competências explícitas, com autorização e relações SQL por usuário. Sem saldos, limites, totais ou calendário inferidos. [Contratos executáveis e limites](destinations.md).

RF-018 acrescenta movimentos bancários e cobranças efetivas em BRL com valores/datas confirmados na revisão, mantendo sinal da origem, parcelamento parcial e fatura explícita. Ainda sem compra agregada, plano/calendário, orçamento ou classificação automática de consumo/pagamento. [Confirmação, vínculos e limites](import-confirmation.md).

RF-020 acrescenta [fatos explícitos de fatura](card-statements.md): datas, total declarado e ciclo podem continuar desconhecidos, são versionados e não atribuem pagamento, atraso ou alterações nas cobranças. Histórico conserva afirmações anteriores.

RF-021 implementa [compras manuais](purchases.md), com dados completos/parciais e vínculos tipados, sem preencher lacunas pela importação. As [políticas da v0](v0-policies.md) resolvem BIZ-02/BIZ-04/BIZ-05 dentro de limites explícitos.

**Uma cobrança importada pode existir sem a compra completa conhecida.** Por exemplo, um arquivo pode informar apenas a parcela 3/10 de R$ 120. O modelo deverá aceitar esse conhecimento parcial sem inventar data original, total exato ou parcelas anteriores.

Campos e restrições essenciais:

- Valores em centavos com `BIGINT`; no código, representação inteira apropriada. Na API, strings para preservar precisão.
- Moeda explícita.
- Datas de compra, processamento, competência, vencimento e pagamento separadas.
- Datas civis em `DATE`; instantes técnicos em UTC, preservando o fuso informado quando existente.
- `user_id` nos registros financeiros e referências compostas que impeçam vínculos entre usuários.
- Unicidade de número de parcela dentro de um plano.
- Unicidade de ocorrência dentro de uma recorrência.
- Identificadores externos únicos dentro do seu escopo documentado de origem e conta.
- Alocações de recebimentos/pagamentos limitadas ao valor disponível, verificadas dentro da transação.
- Controle de versão para impedir que uma confirmação use uma revisão desatualizada.

Para vínculos financeiros, recomendam-se relações tipadas com chaves estrangeiras. Uma referência genérica `tipo + id`, sem integridade referencial, não será suficiente.

## Regras e exemplos

Recomendam-se duas perspectivas explícitas na V1:

| Perspectiva | Regra proposta |
|---|---|
| **Planejamento mensal** | Compras no cartão distribuídas pelas competências das faturas; outras receitas e despesas conforme o período definido |
| **Caixa** | Entradas e saídas efetivas das contas, com transferências, reembolsos e liquidações identificados por natureza |

A compra completa continuará consultável pela data original. Não será somada novamente às parcelas no mesmo indicador.

O pagamento de uma fatura aparecerá como saída de caixa e redução de obrigação. Não gerará outra despesa de consumo. Juros e tarifas, quando informados, serão despesas próprias.

O saldo calculado de uma conta partirá de um saldo de referência em data conhecida e dos movimentos posteriores. Um saldo informado pela instituição será preservado como observação para conciliação; não criará automaticamente um ajuste para “fazer bater”.

### Validação com os exemplos do briefing

| Exemplo | Comportamento esperado |
|---|---|
| Guarda-roupa de R$ 1.000 em 5 vezes | Cinco cobranças de R$ 200 e obrigação total preservada |
| Pai reembolsa em 5 vezes | Cinco recebíveis independentes; cada Pix liquida o recebível selecionado |
| Pai paga tudo no primeiro mês | Recebível pode ser liquidado integralmente, mantendo as cinco cobranças do cartão |
| Uber de R$ 50 dividido | Fatura mantém R$ 50; reembolso esperado é R$ 25; custo pessoal esperado é R$ 25 |
| Amigo ainda não pagou o Uber | Caixa recebido permanece zero; o custo efetivo ainda não é reduzido por um recebimento inexistente |
| Passagens compradas pelo irmão | Despesa e obrigação com terceiro, com quatro vencimentos; nenhuma compra é criada num cartão próprio |
| Salário nos dias 15 e 30 | Duas ocorrências previstas; importação posterior liquida cada ocorrência sem criar outra receita |
| Transferência para investimento próprio | Redução da conta de origem e alocação patrimonial; sem despesa de consumo |

Para reembolsos, a interface mostrará separadamente valor original, estorno, reembolso esperado, recebido e pendente. O total recuperável não poderá exceder o valor elegível da despesa sem revisão explícita. Estornos posteriores deverão reabrir essa análise.

Parcelamento manual usará divisão inteira e distribuição determinística dos centavos restantes. Por exemplo, R$ 100 em três parcelas poderá produzir R$ 33,34, R$ 33,33 e R$ 33,33. Valores efetivamente informados pela instituição terão prioridade sobre a distribuição estimada.

Os estados serão separados por dimensão: previsão/registro efetivo, conciliação, liquidação parcial/total e cancelamento/reversão. “Conciliado” não substituirá “pago”.

Para faturas, a identificação inicial seguirá a prioridade solicitada: informação explícita da instituição, período confirmado na importação e estimativa pelo calendário do cartão. **Uma correção manual confirmada será preservada**; nova informação conflitante gerará revisão.

## Políticas confirmadas pelo usuário

Em 08/10/2026 foram aprovados: orçamento consumido pelo valor bruto, com reembolsos separados; recorrências em dias inexistentes ajustadas ao último dia do mês, sem deslocamento automático por dia útil na V1; contabilização em BRL; planejamento por competência da fatura e visão de caixa separada. Recebimentos de reembolso alteram caixa e custo pessoal líquido, sem recompor o orçamento bruto. Fundamentação: [ADR-0002](decisions/0002-financial-policies.md).

Os contratos, invariantes, estados e limites de conhecimento estão em [contracts.md](contracts.md). Questões ainda abertas estão em [decisions/pending.md](decisions/pending.md).
