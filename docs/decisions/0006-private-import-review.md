# ADR-0006 — Arquivo privado e parsing recuperável da RF-017

- Data: 08/10/2026.
- Estado: aceita no escopo da implementação incremental autorizada.
- Contexto: CSV/OFX precisam de upload privado, recuperação após interrupção e revisão persistida antes de efeitos financeiros, sem contratar armazenamento ou fila externos.
- Decisão: armazenar bytes limitados em PostgreSQL com o lote, separar origem/candidato/correções, usar fila persistida com lease e token, e executar parsers em thread isolada. Contratos e limites atuais em [revisão](../import-review.md); princípios anteriores no ADR-0003 permanecem.
- Consequências: upload e arquivo são atômicos e privados; worker antigo não sobrescreve a revisão; banco/backups passam a conter bytes financeiros e exigem política de retenção/capacidade antes de produção. Armazenamento externo e processo/container dedicado poderão substituir adaptadores mediante necessidade medida, sem alterar domínio/revisão. Não ativar prazo de retenção ainda não aprovado nem antecipar confirmação RF-018.
