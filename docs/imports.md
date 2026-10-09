# Importação e conciliação — CSV e OFX obrigatórios na V1

> Arquitetura geral aprovada em 08/10/2026. Este documento define o destino planejado; consulte [progresso](progress.md) e [tasks](tasks/README.md) para saber o que está implementado.

## Fluxo e formatos

O fluxo proposto é:

**Enviar arquivo → selecionar destino → interpretar → revisar → conciliar → confirmar → consultar resultado.**

O processamento automático preparará o lote inteiro. O usuário concentrará sua atenção nas exceções e poderá aplicar correções em conjunto.

**CSV:** reconhecimento de layouts conhecidos e mapeamento manual reutilizável. O importador deverá tratar separadores, aspas, descrições com quebras de linha, cabeçalhos extras, encoding, formatos de data, separadores decimais e convenções de débito/crédito. Datas e valores ambíguos exigirão configuração explícita, com exemplos na prévia.

**OFX:** suporte às famílias 1.x baseadas em SGML e 2.x baseadas em XML, para extratos bancários e de cartão. A documentação do mantenedor distingue essas famílias. A compatibilidade será documentada por versões e arquivos de teste, incluindo as variações efetivamente homologadas. [Especificações OFX — Financial Data Exchange](https://financialdataexchange.org/about-fdx/ofx-work-group/)

O adaptador extrairá datas, descrições, valores, moeda, conta e identificadores quando presentes. Guardará também os dados de origem necessários para explicar a normalização.

### Parcelamento e fatura com informação incompleta

| Informação disponível | Ação proposta |
|---|---|
| Parcela e quantidade explicitamente informadas | Preencher os campos e apresentar na revisão |
| Descrição sugere “03/10” | Sugerir interpretação, mostrando o trecho; exigir confirmação |
| Só existe valor da cobrança | Registrar a cobrança conhecida, com parcelamento desconhecido |
| Compra já cadastrada manualmente | Sugerir vínculo à parcela existente |
| Período explícito de faturamento | Associar à fatura correspondente |
| Apenas intervalo do extrato | Não assumir que seja o período da fatura |
| Fatura ausente | Manter na revisão e exigir competência confirmada antes de gravar cobranças; permitir seleção em lote |

**Não será permitido multiplicar silenciosamente o valor de uma parcela para inventar o total da compra.** Também não serão geradas parcelas futuras ou anteriores apenas pela semelhança da descrição.

BIZ-03 resolvida em 08/10/2026: sem competência, linhas permanecem na revisão até confirmação explícita do período. Linhas excluídas da seleção não bloqueiam as válidas. [ADR-0005](decisions/0005-missing-statement-period.md). Os [destinos RF-016](destinations.md) permitem cadastrar períodos confirmados, sem inferir competência do intervalo do extrato.

Quando o usuário optar por completar um parcelamento, verá uma proposta com quantidade, valores, primeira parcela conhecida e calendário. As parcelas estimadas serão conciliadas com cobranças efetivas que chegarem posteriormente.

A revisão exibirá os registros como válidos, incompletos, inválidos ou possíveis duplicatas. Antes de confirmar, mostrará quantidades e totais por destino, além do que será criado, vinculado ou ignorado.

Erros críticos nas linhas selecionadas impedirão sua confirmação. Será possível excluir explicitamente linhas problemáticas e confirmar as demais. A gravação do conjunto selecionado será atômica: ou todos os lançamentos e vínculos são gravados, ou nenhum deles.

Propõem-se como limites iniciais **10 MB e 10 mil registros por arquivo**, sujeitos à medição. O aceite funcional deverá demonstrar, no mínimo, uma fatura com **500 compras**, sem cadastro individual. Arquivos com múltiplas contas terão seus blocos separados e destinos confirmados.

Totais declarados pelo arquivo, quando disponíveis, serão comparados com o lote. Diferenças serão apresentadas; não serão compensadas por lançamentos artificiais.

## Consistência e duplicidades

A prevenção de duplicidades terá três níveis:

| Evidência | Tratamento |
|---|---|
| Mesmo lote já confirmado | Retornar o resultado anterior |
| Mesma identidade externa, no escopo correto, com dados compatíveis | Reconhecer o registro existente |
| Semelhança por data, valor, descrição, conta, parcela e fatura | Apresentar correspondência candidata |

O hash do arquivo ajudará a detectar reenvios, mas não será a única proteção: dois arquivos diferentes podem conter o mesmo período.

**Descrição e valor iguais nunca serão, isoladamente, prova de duplicação.** O usuário poderá vincular ao registro existente, manter ambos ou revisar. Identificador externo repetido com valor ou data conflitante será tratado como divergência ou correção da origem, sem sobrescrita silenciosa.

Ao conciliar, o sistema preservará categorias, observações, reembolsos e correções do usuário. O lançamento existente ganhará um vínculo de origem.

A idempotência será garantida também no banco, com restrições únicas e transações. Na confirmação, o backend verificará novamente destinos, versões e correspondências, pois os dados podem ter mudado desde a prévia.

Uma chave de idempotência ficará associada ao conteúdo do comando: reutilizar a mesma chave com outra decisão produzirá conflito. Falhas transitórias poderão ser repetidas com segurança. Prisma permite configurar transações e níveis de isolamento; operações concorrentes críticas deverão ter tratamento explícito de conflitos e repetição limitada. [Transações no Prisma](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)

As liquidações permitirão relações de vários para vários: um Pix pode pagar dois recebíveis, e um recebível pode ser pago em dois Pix. O controle será pelo valor alocado, impedindo aproveitar o mesmo dinheiro duas vezes.

Reverter uma importação respeitará as dependências criadas depois dela. Registros previamente existentes e apenas conciliados serão desvinculados; não serão apagados como se tivessem nascido naquele lote.

## Contratos

O estado persistido da revisão, o comando de confirmação e as invariantes estão em [contracts.md](contracts.md). O adaptador não deve efetuar gravações financeiras; ele produz candidatos para revisão.

Parsers homologados, fixtures e guardas computacionais: [catálogo RF-015](import-formats.md). Não equivalem à capacidade validada do pipeline de upload/worker.

Upload privado e revisão RF-017: [contrato executável](import-review.md). Confirmação atômica, identidades, decisões de correspondência e consulta RF-018: [confirmação](import-confirmation.md).
