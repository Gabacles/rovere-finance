# ADR-0003 — Importação em área de revisão persistida

- Data: 2026-10-08
- Estado: aceita no escopo da arquitetura geral aprovada e do complemento obrigatório

## Contexto

CSV e OFX têm formatos e graus de informação diferentes. Uploads repetidos, registros manuais prévios e parcelas incompletas exigem revisão rastreável.

## Decisão

Adaptadores produzem registros candidatos; nenhuma gravação financeira ocorre durante parsing. Persistir lote, origem, revisão e decisões de conciliação. Confirmar o conjunto selecionado numa transação, com versão de revisão e chave de idempotência. Informação ausente continua ausente; heurísticas exigem confirmação.

Contratos e fluxos: [contratos](../contracts.md) e [importação](../imports.md).

## Consequências

Será possível retomar uma revisão interrompida, conservar personalizações e processar centenas de compras em lote. A área de revisão também exige autorização por usuário, retenção e limpeza. Open Finance futuro poderá reutilizar normalização e conciliação sem se tornar dependência dos arquivos.
