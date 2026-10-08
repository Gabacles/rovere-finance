# ADR-0001 — Monólito modular e entregas verticais

- Data: 2026-10-08
- Estado: aceita pelo usuário

## Contexto

Produto greenfield para finanças pessoais brasileiras, com consistência financeira, portfólio público e manutenção por diferentes agentes. Microsserviços aumentariam o custo operacional antes de existir necessidade de escala independente.

## Decisão

Adotar monólito modular NestJS/TypeScript, frontend React/Vite e PostgreSQL. Organizar o código em workspaces npm com `apps/web`, `apps/api` e `packages/domain`. Usar REST; manter o domínio independente de frameworks. A estrutura de workspaces é uma escolha de implementação dentro da arquitetura aprovada.

As justificativas e alternativas estão na [arquitetura](../architecture.md). Dependências concretas ficam nos manifests e no lockfile; a versão sugerida no planejamento não dispensa verificar compatibilidade com o ambiente.

## Consequências

Transações locais e regras centralizadas simplificam consistência. Módulos devem preservar fronteiras mesmo compartilhando processo e banco. Um worker poderá executar o mesmo código em processo separado. A implementação será incremental; [roadmap](../roadmap.md).

## Aprovação

Usuário aprovou expressamente monólito modular, React/Vite, NestJS, PostgreSQL e entregas incrementais. Autorizou documentação, estrutura e primeiras tasks independentes de decisões pendentes.
