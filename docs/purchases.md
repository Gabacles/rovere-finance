# Compras manuais e cobranças conhecidas — RF-021

`Expense` representa a compra econômica, separada de `CardCharge` efetiva e de caixa. Descrição obrigatória, notas opcionais, data original e total BRL com conhecimento/evidência. Data ou total ausentes continuam `unknown`; zero confirmado é diferente de desconhecido. Total é magnitude não negativa, sem dedução do sinal importado. Dados completos significam somente data original e total confirmados, não pagamento, plano completo ou cobertura por cobranças.

A associação explícita confirma que uma cobrança própria se relaciona à compra. Não classifica sua natureza financeira pelo sinal/descrição (RF-023), não altera origem, valor, parcela, competência ou correção manual. Cada cobrança tem no máximo uma compra; a compra pode ter várias cobranças, inclusive de créditos próprios distintos. FK tipada composta por proprietário impede cruzamento de usuários. Desassociação é explícita e auditada, sem excluir cobrança.

Não multiplicar parcela pelo número de parcelas, somar cobranças para preencher total nem copiar data de processamento para data original. Criar compra manual não cria cobrança, fatura, plano ou movimento bancário. Nova importação mantém seus registros/identidades e não sobrescreve a compra. Indicadores futuros não somarão compra agregada e cobranças no mesmo indicador. Categoria, alocações e totais calculados ficam nas próximas tasks.

RF-022 acrescenta [planos confirmados](installment-plans.md) por comando separado: total da compra deve estar conhecido e coincidir; com plano existente, limpar/mudar total é recusado até revisão explícita do plano (evolução futura). Cobrança conciliada exige desconciliação antes de desassociar; descrição/notas/data original continuam editáveis. Leitura da compra inclui plano ou null; respostas idempotentes/histórico antigos permanecem preservados.

## HTTP executável

Todas as rotas exigem sessão própria. Escritas exigem JSON, origem confiável e `Idempotency-Key` (1–100 caracteres alfanuméricos, `_`/`-`). Mesmo proprietário/chave/payload normalizado recupera a resposta original, inclusive após edição posterior; dados diferentes retornam 409. Chave abrange todos os comandos de compra do usuário.

| Rota | Contrato |
|---|---|
| `POST /api/expenses` | `{description, notes?, facts?: {purchasedOn?: YYYY-MM-DD ou null, total?: {currency:'BRL',cents:string} ou null}}`; retorna compra versão 0 |
| `GET /api/expenses?page=1` | Página de 25 resumos, total de registros; sem total monetário presumido |
| `GET /api/expenses/:id` | Compra, conhecimento, versão e cobranças associadas com valores originais |
| `PATCH /api/expenses/:id` | `{expectedVersion, description?, notes?, facts?, association?: {action:'link' ou 'unlink', chargeId}}`; pelo menos uma alteração, atômica |
| `GET /api/expenses/:id/history` | Últimos 20 comandos, versão, antes/depois, decisão de vínculo e instante; histórico completo permanece no banco |

Campos ausentes numa edição são preservados; `null` limpa explicitamente uma afirmação/nota. Dados são validados no domínio puro e novamente protegidos por constraints SQL. Edição usa compare-and-swap de versão e comandos do mesmo usuário são serializados na transação, incluindo a disputa por cobrança entre compras. Falha do vínculo ou histórico desfaz toda a edição. Comandos e suas respostas são imutáveis. 404 não revela dados de outro usuário; conflitos de versão/vínculo/chave retornam 409 sem payload financeiro ou stack.
