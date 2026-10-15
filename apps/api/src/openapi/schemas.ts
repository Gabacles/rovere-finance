// HTTP documentation only. Domain validation remains independent of OpenAPI/frameworks.
export type Schema = Record<string, unknown>;
export const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
export const str = (extra: Schema = {}): Schema => ({ type: 'string', ...extra });
export const integer = (minimum = 0, maximum = Number.MAX_SAFE_INTEGER): Schema => ({ type: 'integer', minimum, maximum });
export const enumeration = (...values: string[]): Schema => str({ enum: values });
export const bool: Schema = { type: 'boolean' };
export const yes: Schema = { type: 'boolean', enum: [true] };
export const array = (items: Schema, extra: Schema = {}): Schema => ({ type: 'array', items, ...extra });
export const nullable = (value: Schema): Schema => ({ anyOf: [value, { type: 'null' }] });
export const obj = (properties: Record<string, Schema>, required = Object.keys(properties), extra: Schema = {}): Schema => ({ type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false, ...extra });
export const jsonObject: Schema = { type: 'object', additionalProperties: true, description: 'JSON preservado da origem ou do journal; campos dependem do formato/operação.' };
export const id = str({ minLength: 1, maxLength: 150, example: 'id_ficticio', description: 'Identificador opaco retornado pela API; não reconstruir ou presumir formato UUID.' });
export const commandId = { ...id, maxLength: 100, pattern: '^[A-Za-z0-9_-]{1,100}$' };
export const version = integer(0, 2147483646);
export const date = str({ format: 'date', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', example: '2026-10-14', description: 'Data civil gregoriana válida, anos 0001–9999; não é instante UTC.' });
export const period = str({ pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$', example: '2026-10' });
export const instant = str({ format: 'date-time' });
export const text = str({ minLength: 1, maxLength: 500 });
export const reason = str({ minLength: 1, maxLength: 1000 });
export const notes = nullable(str({ maxLength: 1000 }));
export const cents = str({ pattern: '^(0|-?[1-9][0-9]*)$', example: '10000', description: 'Inteiro decimal canônico em centavos, dentro de BIGINT signed 64 bits. Sem +, -0, separador, expoente ou ponto flutuante.' });
export const money = obj({ currency: enumeration('BRL'), cents });
export const magnitude = obj({ currency: enumeration('BRL'), cents: { ...cents, pattern: '^(0|[1-9][0-9]*)$' } });
export const positiveMoney = obj({ currency: enumeration('BRL'), cents: { ...cents, pattern: '^[1-9][0-9]*$' } });
export const known = (value: Schema): Schema => ({ oneOf: [obj({ state: enumeration('unknown') }), obj({ state: enumeration('confirmed'), value, evidence: ref('Evidence') })], description: 'unknown não equivale a zero. confirmed exige evidência.' });
export const available = (value: Schema = money): Schema => obj({ state: enumeration('available'), amount: value });
export const amountResult: Schema = { oneOf: [available(), obj({ state: enumeration('overflow') })] };
export const maybeAmount: Schema = { oneOf: [available(), obj({ state: enumeration('unknown') })] };
export const page = (rows: Schema): Schema => obj({ page: integer(1), total: integer(), rows: array(rows) });
export const history = (withVersion = false): Schema => array(obj({ id, ...(withVersion ? { version } : {}), changes: jsonObject, createdAt: instant }), { maxItems: 20, description: 'Até 20 comandos mais recentes; versões/snapshots históricos não são a versão atual.' });
export const factsInput = obj({ closingOn: nullable(date), dueOn: nullable(date), declaredTotal: nullable(money), cycle: nullable(enumeration('open', 'closed')), coverage: nullable(enumeration('complete', 'partial')) }, [], { minProperties: 1 });
export const expenseFactsInput = obj({ purchasedOn: nullable(date), total: nullable(magnitude) }, []);
export const expenseInput = { description: text, notes, facts: expenseFactsInput };
export const incomeInput = { description: text, notes, facts: obj({ expectedOn: nullable(date), expectedAmount: nullable(magnitude) }, []) };
export const classificationInput = obj({ nature: enumeration('purchase', 'fee', 'interest', 'refund', 'other_credit', 'other_debit', 'previous_balance', 'payment', 'informational'), amount: magnitude });
export const adjustmentInput = { expectedStatementVersion: version, postedOn: date, description: text, amount: obj({ currency: enumeration('BRL'), cents: { ...cents, pattern: '^-?[1-9][0-9]*$' } }), classification: obj({ nature: enumeration('fee', 'interest', 'other_debit', 'other_credit', 'refund'), amount: positiveMoney }), reason, informedConfirmed: yes };
export const refundVersions = { expectedExpenseVersion: version, expectedChargeVersion: version, expectedStatementVersion: version, reason };
export const schemas: Record<string, Schema> = {
  Money: money,
  Income: obj({ id, version: integer(0, 2147483647), description: text, notes, state: enumeration('planned', 'cancelled'), origin: obj({ kind: enumeration('manual'), decisionId: id }), knowledge: enumeration('partial', 'complete'), facts: obj({ expectedOn: known(date), expectedAmount: known(magnitude) }) }),
  IncomeHistory: array(obj({ id, version: integer(0, 2147483647), changes: obj({ action: enumeration('create', 'edit', 'cancel', 'allocate', 'reverse'), patch: obj(incomeInput, []), previous: nullable(ref('Income')), current: ref('Income'), settlement: jsonObject }, ['action', 'patch', 'previous', 'current']), createdAt: instant }), { maxItems: 20, description: 'Últimas 20 versões, mais recente primeiro. Journal integral permanece no banco; inclui recebimentos e reversões explícitos.' }),
  BankSettlementSource: obj({ id, accountId: id, version: integer(0, 2147483647), postedOn: date, description: str(), amount: money, confirmation: nullable(obj({ direction: enumeration('inflow', 'outflow'), amount: positiveMoney, evidence: ref('Evidence') })), current: bool, allocated: magnitude, available: maybeAmount }),
  IncomeReceiptProgress: obj({ state: enumeration('unknown', 'unreceived', 'partial', 'received', 'no_expected_amount', 'cancelled', 'review_required'), received: magnitude, pending: maybeAmount, difference: maybeAmount }),
  IncomeSettlements: obj({ income: ref('Income'), progress: ref('IncomeReceiptProgress'), allocations: page(obj({ id, bankEntryId: id, accountId: id, amount: positiveMoney, postedOn: date, description: str(), reversedAt: nullable(instant), evidence: ref('Evidence') })), bankEntry: nullable(ref('BankSettlementSource')) }),
  Evidence: { oneOf: [obj({ kind: enumeration('user'), decisionId: id }), obj({ kind: enumeration('source'), sourceRecordId: id, field: str() })] },
  ApiError: obj({ code: str(), message: str(), requestId: str({ format: 'uuid' }), violations: array(jsonObject) }, ['code', 'message'], { description: 'requestId está presente nos filtros financeiros; bloqueio de origem retorna apenas code/message.' }),
  NestError: obj({ statusCode: integer(400, 599), message: str(), error: str() }, ['statusCode', 'message'], { additionalProperties: true }),
  Account: obj({ id, name: str(), currency: enumeration('BRL'), createdAt: instant, updatedAt: instant }),
  CreditAccount: obj({ id, name: str(), currency: enumeration('BRL') }),
  Card: obj({ id, creditAccountId: id, name: str(), kind: enumeration('physical', 'virtual', 'additional') }),
  Statement: obj({ id, creditAccountId: id, period, periodOrigin: enumeration('manual') }),
  StatementFacts: obj({ closingOn: known(date), dueOn: known(date), declaredTotal: known(money), cycle: known(enumeration('open', 'closed')), coverage: known(enumeration('complete', 'partial')) }),
  StatementDetails: obj({ id, creditAccountId: id, period, periodOrigin: enumeration('manual'), version, facts: ref('StatementFacts') }),
  Installment: known(obj({ number: integer(1, 10000), total: known(integer(1, 10000)) })),
  Classification: known(classificationInput),
  CardCharge: obj({ id, creditAccountId: id, statementId: id, cardId: nullable(id), postedOn: date, description: str(), amount: money, installment: ref('Installment'), notes, version, classification: ref('Classification'), manualAdjustment: obj({ reason, evidence: ref('Evidence'), reversalChargeId: nullable(id) }), reversalOfChargeId: nullable(id) }, ['id', 'creditAccountId', 'statementId', 'cardId', 'postedOn', 'description', 'amount', 'installment', 'notes', 'version', 'classification']),
  ExpenseCharge: obj({ id, creditAccountId: id, statementId: id, postedOn: date, description: str(), amount: money, installment: ref('Installment'), notes }),
  InstallmentPlan: obj({ id, total: magnitude, count: integer(1, 10000), creditAccountId: id, firstPeriod: period, cadence: enumeration('monthly'), evidence: ref('Evidence'), forecasts: array(obj({ id, number: integer(1, 10000), period, plannedAmount: magnitude, state: enumeration('planned', 'recorded'), actual: nullable(obj({ charge: ref('ExpenseCharge'), confirmedAmount: magnitude, evidence: ref('Evidence') })), difference: nullable(money) })) }),
  Expense: obj({ id, version, description: str(), notes, knowledge: enumeration('partial', 'complete'), facts: obj({ purchasedOn: known(date), total: known(magnitude) }), charges: array(ref('ExpenseCharge')), installmentPlan: nullable(ref('InstallmentPlan')), refunds: obj({ refunded: magnitude, eligibleCost: maybeAmount, reviewRequired: bool, rows: array(obj({ chargeId: id, amount: positiveMoney, reason, description: str() })) }) }),
  StatementSummary: obj({ statementVersion: version, facts: ref('StatementFacts'), recordCount: integer(), unclassifiedCount: integer(), coverageCurrent: bool, groups: obj(Object.fromEntries(['purchase', 'fee', 'interest', 'refund', 'other_credit', 'other_debit', 'previous_balance', 'payment', 'informational'].map(nature => [nature, obj({ count: integer(), total: amountResult })]))), consumptionGross: amountResult, reportedPayments: amountResult, knownSubtotal: amountResult, calculatedTotal: { oneOf: [amountResult, obj({ state: enumeration('incomplete'), reasons: array(str()) })] }, difference: { oneOf: [amountResult, obj({ state: enumeration('unknown') })] }, comparison: enumeration('equal', 'different', 'unknown', 'overflow') }),
  PaymentCandidate: obj({ kind: enumeration('declared', 'calculated'), total: magnitude, referenceHash: str({ pattern: '^[a-f0-9]{64}$' }) }),
  PaymentSource: obj({ id, accountId: id, version, postedOn: date, description: str(), amount: money, confirmedOutflow: nullable(obj({ amount: positiveMoney, evidence: ref('Evidence') })), current: bool, allocated: magnitude, available: maybeAmount }),
  StatementPayments: obj({ statementId: id, creditAccountId: id, period, statementVersion: version, candidates: obj({ declared: nullable(ref('PaymentCandidate')), calculated: nullable(ref('PaymentCandidate')) }), blockers: array(str()), basis: nullable(obj({ kind: enumeration('declared', 'calculated'), total: magnitude, current: bool, evidence: ref('Evidence') })), progress: obj({ state: enumeration('unknown', 'unpaid', 'partial', 'paid', 'no_obligation', 'review_required', 'credit_review_required'), allocated: magnitude, remaining: maybeAmount, creditExcess: maybeAmount }, ['state', 'allocated', 'remaining']), allocations: page(obj({ id, bankEntryId: id, accountId: id, amount: positiveMoney, postedOn: date, description: str(), reversedAt: nullable(instant), evidence: ref('Evidence') })) }),
  PaymentResult: obj({ statement: ref('StatementPayments'), bankEntry: nullable(ref('PaymentSource')) }),
  AdjustmentResult: obj({ charge: ref('CardCharge'), expense: nullable(ref('Expense')), statement: ref('StatementDetails') }),
};
