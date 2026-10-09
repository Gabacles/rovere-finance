# Upload privado e revisão persistida — RF-017

Esta entrega prepara e conserva uma revisão de CSV/OFX. Não cria movimentos bancários, despesas, cobranças ou parcelas. Criação/vínculo financeiro, conciliação e confirmação transacional pertencem à RF-018. [Contratos gerais](contracts.md), [parsers homologados](import-formats.md) e [destinos](destinations.md).

## Persistência e processamento

`ImportBatch` guarda formato, configuração, hash do comando, estado, versão, tentativas e lease. `ImportFile` conserva os bytes originais privados em PostgreSQL `BYTEA`; não há arquivo público, caminho controlado pelo cliente ou provedor contratado. `ImportBlock` separa as contas do arquivo, com metadados originais e destinos tipados. `ImportSourceRecord` conserva texto, campos, posição e competência de origem; `ImportRow` separa candidato original, correções e decisão `create`/`skip`. `ImportReviewRevision` registra alterações manuais e configurações anterior/nova em retries.

Bytes, registros de origem e candidatos originais são imutáveis por triggers SQL. Correções têm evidência do usuário e ID de decisão; remover uma correção restaura a origem. Sugestões de parcela permanecem separadas; preencher número sem total mantém o total desconhecido, sem criar parcelas. Valores são strings de centavos e `bigint`; a UI interpreta a entrada em reais por manipulação exata de texto, sem ponto flutuante.

O coordenador roda na API e consulta a fila a cada 500 ms, com um job ativo por instância. Parsing síncrono da biblioteca roda em `worker_threads`, fora do event loop HTTP. A tarefa é reclamada atomicamente por `FOR UPDATE SKIP LOCKED`; token de lease impede que uma execução antiga publique depois de recuperação. Persistência de todos os blocos/origens/candidatos e transição para revisão ocorre numa transação. Falha não publica registros parciais.

Lease de 120 s; thread com limite de 30 s, 128 MiB de old generation e stack de 4 MiB. Trabalho interrompido é reclamável depois do lease; após três claims interrompidos fica em falha. Erro de parsing/persistência fica em `failed` para retry explícito. Retry exige versão atual, somente em falha, e inicia novo ciclo de tentativas; nunca reprocessa uma revisão corrigida. Encerramento espera o job ativo antes de desconectar o banco. SQL cru e ORM usam o mesmo schema configurado, inclusive em testes.

## API executável

Sessão e proprietário obtido da sessão em todas as rotas; 404 para IDs alheios ou ausentes. Escritas exigem Origin confiável. Exceção de multipart é restrita a `POST /api/imports`; demais escritas continuam JSON. Erros têm código fixo, mensagem e `requestId`; falhas internas registram somente código operacional, sem arquivo/payload/stack financeiro.

| Método e rota | Contrato |
|---|---|
| `POST /api/imports` | Multipart: um `file`, `format=csv/ofx`, `configuration` como JSON; exige `Idempotency-Key`; retorna lote, nenhuma gravação financeira |
| `GET /api/imports` | Vinte lotes recentes do proprietário |
| `GET /api/imports/:id` | Estado, versão, configuração e blocos/destinos; sem bytes, dono ou token de lease |
| `GET /api/imports/:id/file` | Download privado dos bytes originais, attachment com nome interno UUID; 404 após remoção |
| `GET /api/imports/:id/rows` | Somente em revisão; `page` 1–10000, `pageSize` 1–100 (padrão 25), filtro opcional `selected=true/false`; snapshot consistente com versão, origem e candidato efetivo |
| `PATCH /api/imports/:id/review` | `expectedVersion`; alterações de blocos, até 50 linhas, ou seleção em lote; transação e 409 para versão/estado diferente |
| `POST /api/imports/:id/retry` | `expectedVersion`, configuração opcional; somente falha; preserva histórico da configuração; 409 para revisão ou versão antiga |
| `DELETE /api/imports/:id` | `expectedVersion`; remoção explícita de arquivo, origens, revisão e histórico de lote ainda não confirmado; parsing/confirmado não removíveis |

Upload de CSV: `{ "profile": ... }` conforme catálogo; OFX: `{}` para encoding declarado/UTF-8 estrito, ou `{ "encoding": "windows-1252" }` explícito. Campos extras são rejeitados. Extensão precisa corresponder ao formato; estrutura e conteúdo são validados pelo parser, sem confiar no MIME.

Chave de idempotência: 1–100 letras ASCII, números, `_` ou `-`, escopo proprietário. Reenvio com mesma chave, bytes, nome, formato e configuração normalizada retorna o lote existente; payload diferente retorna 409. Reenvio após remoção retorna o lote cancelado, exigindo nova chave para nova revisão.

Exemplo de alteração:

```json
{
  "expectedVersion": 1,
  "blocks": [{ "id": "bloco", "financialAccountId": "conta" }],
  "rows": [{ "id": "linha", "corrections": { "amount": { "currency": "BRL", "cents": "-1235" } } }]
}
```

Linhas aceitam `selected` (true → create; false → skip), motivo opcional e correções de `postedOn`, `description`, `amount`, `installment`. `null` remove uma correção; origem não é editável. `all: { selected, blockId? }` seleciona/exclui em lote. `link` e `distinctFrom` terão validação financeira na RF-018, pois ainda não existem registros financeiros de destino.

Blocos bancários aceitam `financialAccountId`; blocos de cartão aceitam `creditAccountId`, cartão opcional, fatura opcional e `periodOverride`. Toda substituição de destino é explícita. FKs compostas garantem dono e que cartão/fatura pertencem ao crédito escolhido. Destino e competência podem ficar pendentes na revisão. Competência divergente da origem gera bloqueio até confirmação explícita `periodOverride=true`; intervalo do extrato não supre competência. Correções manuais sobrevivem a reabertura e recuperação da tarefa.

## Limites e interface

Guardas iniciais: 10 MiB/arquivo, 10 mil linhas, uma parte de arquivo, dois campos multipart de até 16 mil bytes, JSON da revisão até 64 KiB. Quota serializada por usuário: vinte lotes não cancelados e 50 MiB de bytes. São limites técnicos, sem promessa de throughput; testes funcionais usam 500 registros por formato.

UI permite mapeamento CSV explícito, envio OFX, prévia de 25 linhas, origem como texto, correções de data/descrição/valor/parcela, seleção em lote/linha, destino por bloco, download, retry e remoção. Cadastros novos de destino atualizam as opções. Revisão salva pode ser reaberta após reload/login; seleção da tela de cadastros RF-016 não substitui salvar destino do lote. Alterar mapeamento de uma revisão já interpretada exige novo upload; retry de falha pode corrigir configuração via API. Perfis reutilizáveis independentes e confirmação financeira não fazem parte desta fatia.

Prazo automático de retenção ainda não definido; não foi aplicada a proposta histórica de trinta dias como regra aprovada. Remoção explícita e quota limitam esta fase local. Antes de uso público, definir retenção/limpeza, backups/criptografia e capacidade operacional. [Segurança](security.md). Decisão técnica de armazenamento/processamento: [ADR-0006](decisions/0006-private-import-review.md).

Implementação: [serviço](../apps/api/src/imports/imports.service.ts), [worker](../apps/api/src/imports/worker.ts), [schema](../apps/api/prisma/schema.prisma), [UI](../apps/web/src/imports.tsx). Evidências nas [tasks](tasks/phase-1.md).
