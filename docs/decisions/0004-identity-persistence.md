# ADR-0004 — Identidade persistida e isolamento inicial

- Data: 08/10/2026.
- Estado: aceita dentro da implementação incremental autorizada.
- Contexto: RF-013 antecede a recepção de arquivos financeiros e precisa demonstrar autorização real em PostgreSQL.
- Decisão: Better Auth 1.7.7 com adaptador Prisma 7.10; sessão consultada no banco em cada requisição protegida; email confirmado antes de login e recuperação com revogação de sessões. Migrar schema versionado, sem reset de dados. Regras atuais no [contrato de identidade](../identity.md).
- Isolamento: proprietário obtido exclusivamente da sessão. Uma conta mínima permite testar consultas/escritas de dois usuários; não antecipa saldos, cartões ou importação. Relação com usuário e índice composto no banco; autorização na API, sem alegar RLS.
- Emails: SMTP configurável, Mailpit no desenvolvimento e nos testes. Nenhum provedor externo contratado ou envio externo necessário.
- Consequências: migrations são pré-requisito de inicialização; testes usam PostgreSQL real e schema exclusivo em `rovere_test`. O frontend usa formulários HTML e fetch nesta fatia pequena; adoção das bibliotecas de formulários/consultas da stack fica para os fluxos maiores, sem substituir decisões financeiras pendentes.
- Dependências: overrides temporários de `deepmerge-ts` 8.0.2 no `@prisma/config` e `mysql2` 3.24.5 no CLI Prisma corrigem avisos da auditoria; comandos de geração, migração e testes devem validar compatibilidade. Reavaliar ao atualizar Prisma, sem downgrade automático de versão principal.
