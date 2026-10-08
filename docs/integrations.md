# Integrações futuras

> Arquitetura geral aprovada em 08/10/2026. Este documento define o destino planejado; consulte [progresso](progress.md) e [tasks](tasks/README.md) para saber o que está implementado.

O acesso aos dados bancários de clientes não é uma API pública liberada apenas por possuir uma conta. O Banco Central informa que a participação no ecossistema é restrita às instituições autorizadas, com condições regulatórias aplicáveis. Para este produto independente, a rota a avaliar é uma contratação/parceria apropriada com provedor habilitado. [Banco Central](https://www.bcb.gov.br/meubc/faqs/s/open-finance)

| Alternativa | Evidência encontrada | O que ainda precisa de validação |
|---|---|---|
| Pluggy | APIs de dados e conectores Open Finance; documentação lista Itaú, Caixa e Nubank | Produtos por conector, faturas, parcelas, limites, contrato e custo final |
| Belvo | Agregação brasileira, consentimentos e processamento de dados de faturas | Cobertura por instituição, disponibilidade dos campos e proposta comercial |
| Klavi | APIs de consentimento, dados financeiros e sandbox | Adequação ao produto, cobertura e custos |
| Participação/parceria direta especializada | Alternativa institucional possível de avaliar | Responsabilidades regulatórias, certificações, operação e viabilidade econômica |

A Pluggy anuncia o produto empresarial de dados **a partir de R$ 2.500/mês**; sua documentação também orienta consultar vendas para habilitar conectores Open Finance. Esse valor não deve ser interpretado como orçamento final da integração. [Preços Pluggy](https://www.pluggy.ai/precos), [conectores Pluggy](https://v2.docs.pluggy.ai/pt/docs/open-finance/overview)

Belvo documenta consentimentos e notificações relacionadas a faturas; a precificação aplicável ao projeto deverá ser confirmada comercialmente. Klavi documenta um sandbox e a transição para planos com instituições reais. [Belvo — integração](https://developers.belvo.com/products/aggregation_brazil/aggregation-brazil-integration-widget), [Belvo — planos](https://belvo.com/pt-br/planos-precos/), [Klavi — API](https://docs.klavi.ai/connect/api-only)

A recomendação é adiar a escolha do provedor até uma prova de conceito comparar **instituição × produto × campo × atualização × custo**. Ter o banco listado não garante disponibilidade de todos os dados desejados.

O desenho futuro incluirá consentimento, escopos, expiração, revogação, renovação, última sincronização, falhas e dados ausentes. Webhooks e sincronizações serão idempotentes. A revogação interromperá novas consultas, com tratamento dos dados já armazenados conforme a política aplicável.

Somente funcionalidades de leitura serão integradas. O ambiente local e a demonstração usarão provedores simulados.
