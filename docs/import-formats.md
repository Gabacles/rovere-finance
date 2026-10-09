# Catálogo executável dos adaptadores — RF-015

Implementação em [packages/importers](../packages/importers/src/index.ts). Funções puras de entrada/saída, sem HTTP, banco, arquivos externos ou criação de fatos financeiros. Usam dinheiro/data do domínio. Resultado inclui texto decodificado, blocos de origem, registros originais, candidatos, sugestões e violações. IDs de linha são locais ao `sourceId` fornecido pelo chamador; não são prova de duplicidade financeira.

## CSV genérico v1

Perfil obrigatório: encoding (`utf-8` ou `windows-1252`), separador (vírgula/ponto e vírgula/tab), linha do cabeçalho, formato de data (`YMD`, `DMY`, `MDY`), separador decimal, agrupamento de milhares, convenção de sinal e natureza banco/cartão. BRL é configuração explícita. Nenhuma autodetecção silenciosa.

Colunas obrigatoriamente mapeadas: data, descrição e valor. Opcionais: ID externo, número/quantidade de parcelas e competência da fatura `YYYY-MM`. Mapeamentos e sua versão lógica (`profile.id`) são preservados no resultado. Cabeçalhos extras anteriores ao cabeçalho tabular são saltados pela linha configurada; cabeçalhos duplicados, ausentes ou mapeamento ambíguo são rejeitados.

Aspas, escapes, BOM e descrições multilinha usam [csv-parse](https://csv.js.org/parse/options/). Sem cast numérico: centavos são calculados com `bigint`, com validação BIGINT. Formatos monetários fora da configuração e precisão maior que dois decimais exigem correção; não há arredondamento. Campos ausentes/invalidáveis geram violações por linha, mantendo linhas válidas e evidência original.

## OFX genérico v1

Fixtures homologadas: [banco SGML 1.02](../packages/importers/test/fixtures/bank-102.ofx), [cartão XML 2.20](../packages/importers/test/fixtures/card-220.ofx), variantes sintéticas cruzadas e múltiplas contas. Suporte é ao subconjunto de extratos `STMTRS`/`CCSTMTRS` e `BANKTRANLIST/STMTTRN`; não equivale a homologação de todos os serviços/versões da especificação. Versões declaradas 1xx/2xx são preservadas e passam pela mesma validação estrutural; variantes não cobertas devem ganhar fixtures antes de serem declaradas homologadas. [Especificação oficial](https://financialdataexchange.org/about-fdx/ofx-work-group/).

SGML aceita folhas conhecidas sem fechamento e agregados explicitamente fechados. Extensões desconhecidas precisam de fechamento explícito. XML exige fechamento correto e passa pelo [XMLValidator](https://github.com/NaturalIntelligence/fast-xml-parser). Namespace/atributos em tags do corpo e formatos de mensagem fora do catálogo são rejeitados explicitamente. DTD e declarações de entidades são proibidos; não existe resolução de URL/arquivo. Entidades XML básicas e numéricas são decodificadas como texto.

Preservam-se `FITID`, identificadores da instituição/conta, `NAME`, `MEMO`, `TRNTYPE`, correções e campos desconhecidos no texto original. `DTPOSTED` aceita data de oito dígitos ou timestamp completo, com fração/fuso opcionais; data civil informada é preservada sem conversão UTC, e timestamp bruto permanece na origem. `TRNAMT` mantém o sinal da instituição. Moeda ausente/estrangeira exige revisão, sem conversão cambial. Intervalo `DTSTART/DTEND` é período do download, nunca competência presumida da fatura.

Charset/declaração informada define UTF-8/Windows-1252; na ausência usa-se UTF-8 estrito, sem fallback. Override explícito é preservado. Outros encodings e bytes inválidos são rejeitados; USASCII sem charset não aceita texto não ASCII. Nenhum ID interno de conta/cartão/fatura é atribuído automaticamente: destinos serão confirmados pela API com sessão e autorização.

## Conhecimento e erros

Parcela explicitamente mapeada no CSV vira informação de origem. Texto `03/10` só gera sugestão, inclusive quando pode ser data. Número/total inconsistentes bloqueiam a linha. Não se calcula total da compra nem se cria parcela futura. Metadados OFX proprietários de parcelamento permanecem na origem até homologação do layout/mapeamento específico.

`STATEMENT_PERIOD_REQUIRED` bloqueia a confirmação de cartão sem competência, conforme BIZ-03 aprovada. O parser não atribui um `statementId`: o módulo de revisão deverá resolver/criar a fatura a partir do período e destino confirmados. O intervalo do extrato não satisfaz esse requisito.

Erros estruturais são `ImportFileError` com código fixo e sem payload financeiro; não retornam sucesso parcial. Erros de dados são violações por linha. Duplicatas, inclusive FITID repetido, são preservadas; conciliação e idempotência pertencem à confirmação transacional futura.

Limites computacionais iniciais: 10 MiB, 10 mil linhas, 64 Ki caracteres/registro CSV, 64 Ki caracteres por registro/transação OFX, profundidade 32 e 250 mil elementos OFX. Há testes de rejeição e lote de 500; isso não comprova desempenho em produção nem define retenção. Parsing é síncrono nesta biblioteca; upload/worker devem impor limites de tempo e execução fora do fluxo interativo na RF-017.
