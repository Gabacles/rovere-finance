# Receitas recorrentes mensais — RF-029

P3-01 aprovada expressamente em 15/10/2026: cadência mensal, valor fixo BRL informado, uma âncora por regra (dias 15/30 usam duas regras), início/fim inclusivos, geração somente em intervalo finito solicitado com prévia e confirmação. Limite técnico inicial de 120 meses por comando, verificado nos testes; não é prazo financeiro ou capacidade de produção homologada. [ADR-0016](decisions/0016-confirmed-monthly-income-generation.md). P3-02 aprovada em 15/10/2026 e detalhada no [ciclo de vida RF-030](recurrence-lifecycle.md); permanecem pendentes P3-04 a P3-07.

## Regra e ocorrências

Descrição de 1–500 caracteres, notas opcionais até 1000, amount BRL em centavos canônicos não negativos até BIGINT, anchorDay inteiro 1–31, startsOn civil obrigatório, endsOn civil ou null. Datas entre 0001–9999; fim não pode anteceder início. Criar regra não gera receitas. A programação inicial é preservada; RF-030 acrescenta revisões futuras imutáveis e estados de série. version avança ao confirmar gerações ou alterações, inclusive geração sem novas ocorrências. Não há job, fornecedor ou geração automática/infinita.

Cada período YYYY-MM usa a âncora original com occurrenceInMonth: mês curto usa último dia sem alterar a âncora nem deslocar por dia útil. A ocorrência só é elegível se a data estiver entre startsOn e endsOn, inclusivos. Geração solicita fromPeriod/toPeriod inclusivos, válidos, ordenados e no máximo 120 meses, mesmo se parte estiver fora da vigência da regra. Prévia informa create/existing/outside_rule/blocked, data prevista, valor e ID/estado da receita existente quando houver. Zero continua previsão sem recebimento.

Unicidade por regra/período, sem fundir duas regras na mesma data de fevereiro. ScheduledOccurrence conserva vínculo tipado com regra e Income por proprietário; origem da receita distingue recurrence/manual e conserva IDs da regra/ocorrência/decisão. Afirmações conhecidas guardam evidência da confirmação de geração. IncomeCommand registra a versão inicial de cada receita, e RecurrenceCommand registra comando e resultado completos. Cancelamento futuro de uma ocorrência não permite recriá-la silenciosamente: vínculo/unicidade permanecem.

As ações RF-027 de editar/cancelar receitas geradas permanecem recusadas: usar as rotas específicas RF-030 com prévia/confirmação, preservando origem e recebimentos. Liquidação explícita RF-028 continua disponível nas receitas geradas e mantém suas guardas. Não cria BankEntry, despesa, cobrança, fatura, liquidação, saldo ou orçamento. Reimportações CSV/OFX preservam receitas/vínculos/correções existentes.

## HTTP, prévia e atomicidade

| Rota | Contrato |
|---|---|
| POST `/api/income-recurrences` | description, notes?, amount, anchorDay, startsOn, endsOn; Idempotency-Key; retorna regra |
| GET `/api/income-recurrences?page=1` | 25 regras próprias por página |
| GET `/api/income-recurrences/:id` | Regra, versão, evidência e contagem de ocorrências |
| POST `/api/income-recurrences/:id/preview` | fromPeriod/toPeriod; somente leitura, retorna prévia e previewHash |
| POST `/api/income-recurrences/:id/generate` | expectedVersion, fromPeriod/toPeriod, previewHash, generationConfirmed:true; Idempotency-Key |
| GET `/api/income-recurrences/:id/history` | Últimos 20 comandos; journal integral persistido |

Rotas autenticadas; POST exige Origin confiável/JSON (16 KiB), inclusive prévia. Prévia não é escrita e não consome chave. Escritas têm idempotência por usuário no módulo RecurrenceCommand, versões e journal atômico sob a mesma trava User dos demais módulos. Geração revalida autorização/regra/versão e hash da prévia dentro da transação. Conflito exige obter nova prévia e revisar; mesma chave/corpo/versões recupera resposta original após resposta perdida, nova geração e restart. Snapshot de replay não representa necessariamente a projeção atual; UI atualiza as consultas atuais após recuperação.

Receitas, ocorrências, journals e incremento de versão são confirmados juntos ou desfeitos integralmente. FKs compostas, unicidade regra/período e origem tipada são verificadas no PostgreSQL. Regra, ocorrência e evidências são preservadas; não há DELETE físico; alterações de série seguem o contrato RF-030. Errors JSON redigidos incluem o novo prefixo. OpenAPI publica somente operações implementadas, com políticas RF-026 preservadas.

UI cadastra regra, solicita intervalo finito, mostra a prévia e exige confirmação explícita antes de gerar. Mantém dados/chave nas respostas incertas enquanto montada; permite recuperar resultado e atualizar prévia após conflito. Lista de receitas atualiza sem reload completo. Histórico consultável, labels/teclado/mobile utilizáveis. Não persistir rascunho financeiro em armazenamento do navegador.

Evidências, medições e limites operacionais em [fase 3](tasks/phase-3.md). [Calendário](../packages/domain/src/civil-date.ts), [previsões](planned-incomes.md), [recebimentos](income-settlements.md).

Compatibilidade RF-030: consultas atuais incluem state/schedules, contagem blocked e fatos atuais da receita existente. Replays RF-029 retornam exatamente o JSON original, que pode não conter esses campos adicionados; o OpenAPI admite essa ausência histórica e a UI consulta a projeção atual após replay. A migration não reescreve journals.
