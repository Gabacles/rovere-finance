# Fase 0 — Contexto, decisões e contratos

## [x] RF-000 — Organizar documentação e preservar planejamento

- Estado: concluída
- Descrição: separar o planejamento por assunto, mantendo arquivo histórico integral e índice de continuidade.
- Contexto/objetivo: retomar o projeto sem depender do chat e sem perder requisitos/justificativas.
- Dependências: nenhuma; documentação autorizada pelo usuário.
- Atividades e aceite:
  - [x] Preservar bytes e SHA-256 do documento original.
  - [x] Disponibilizar AGENTS, índice, roadmap, progresso e tasks.
  - [x] Validar links locais e presença das 13 partes do planejamento reorganizado.
  - [x] Identificar claramente o histórico superado pela aprovação.
- Testes necessários: verificação documental por script; revisão de distribuição de conteúdo.
- Implementação: [AGENTS](../../AGENTS.md), [índice](../../PLANEJAMENTO_ARQUITETURA.md), documentos em `docs/`.
- Evidências (08/10/2026): `npm run docs:check` passou; 23 documentos Markdown, 7 tasks, links locais e SHA-256 verificados. Distribuição revisada: seção 1 → scope; 2–4 → architecture; 5–6 → domain; 7–8 → imports; 9 → ux; 10 → integrations; 11 → security; 12 → quality; 13 → roadmap/decisões. Original integral preservado em archive.
- Próximo passo: manter documentos canônicos e histórico de progresso sincronizados nas próximas entregas.

## [x] RF-001 — Registrar decisões, contratos e invariantes

- Estado: concluída
- Descrição: definir fronteiras de compra, parcela, fatura, reembolso, liquidação e importação antes da persistência financeira.
- Contexto/objetivo: evitar inferências silenciosas e dependências de regras não aprovadas.
- Dependências: RF-000.
- Atividades e aceite:
  - [x] Registrar a aprovação da arquitetura e as quatro políticas respondidas pelo usuário.
  - [x] Definir formatos de dinheiro/data, estados independentes, invariantes e contrato de confirmação de lote.
  - [x] Identificar decisões ainda abertas e quais comportamentos bloqueiam.
  - [x] Verificar exemplos do briefing contra os contratos sem perder vínculos financeiros.
- Testes necessários: revisão das invariantes e correspondência com matriz de aceite; testes executáveis das primitivas em RF-011.
- Implementação: [contratos](../contracts.md), [domínio](../domain.md), [ADRs](../decisions/README.md).
- Evidências (08/10/2026): revisão documental dos exemplos de guarda-roupa, Uber, passagens, salário e transferências contra INV-01 a INV-12; aprovadas as políticas no ADR-0002; tipos discriminados em [import-contracts.ts](../../packages/domain/src/import-contracts.ts). `npm run typecheck` passou. RF-011 valida as primitivas. Esta conclusão é do contrato inicial; endpoints financeiros e invariantes de persistência ainda não foram implementados/testados.
- Próximo passo: detalhar DTOs e schema SQL na task de cada funcionalidade, respeitando as pendências registradas.
