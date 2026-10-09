# Políticas de negócio da v0

Em 09/10/2026 o usuário delegou a escolha das recomendações para a v0. Estas decisões complementam as políticas já aprovadas, sem alterar a arquitetura ou ampliar esta entrega. [ADR-0009](decisions/0009-v0-business-policies.md).

- **BIZ-02 — Encargos e financiamento:** registrar somente valores e condições explicitamente informados pela instituição/usuário. Não calcular juros presumidos, simular rotativo ou criar renegociação automática. A implementação futura deve conservar origem e distinguir saldo informado de calculado; não criar ajuste para fazê-los coincidir.
- **BIZ-04 — Formatos prioritários:** a v0 usa CSV configurável e OFX 1.x/2.x já implementados, com fixtures fictícias. Adaptadores específicos serão priorizados quando houver um layout real comprovado e um exemplo anonimizado autorizado. Não inventar uma lista de bancos nem anunciar homologação inexistente. [Catálogo](import-formats.md).
- **BIZ-05 — Excedente de reembolso após estorno:** sinalizar necessidade de revisão explícita do recebível e de eventual devolução ao terceiro. Não reduzir recebimentos históricos, redistribuir valores ou criar dívida/crédito automaticamente. O módulo de terceiros ainda será implementado; esta política define seu limite.

Estas três questões deixam de bloquear o desenvolvimento dentro desses limites. Regras de financiamento automático e homologações específicas exigiriam novas decisões/evidências. Retenção de arquivos e capacidade operacional continuam assuntos técnicos/de privacidade próprios, sem aprovação implícita de prazo legal.
