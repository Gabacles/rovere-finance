# Escopo do produto

> Arquitetura geral aprovada em 08/10/2026. Este documento define o destino planejado; consulte [progresso](progress.md) e [tasks](tasks/README.md) para saber o que está implementado.

O briefing define um MVP abrangente, mas coerente. A redução de complexidade deve ocorrer na profundidade das funcionalidades e na infraestrutura, preservando os fluxos essenciais.

| Obrigatório na V1 | Evolução posterior |
|---|---|
| Autenticação e isolamento entre usuários | Open Finance real |
| Contas, cartões e lançamentos manuais | Gestão avançada de investimentos |
| Importação de extratos e faturas em CSV **e OFX** | PDF, OCR e outros formatos |
| Prévia, correções, conciliação e rastreabilidade | Categorização por IA |
| Compras, parcelas, faturas e pagamentos parciais | Simulações avançadas de crédito |
| Receitas, despesas e assinaturas recorrentes | Compartilhamento familiar de dados |
| Reembolsos e compromissos com terceiros | Aplicativos móveis nativos |
| Categorias, orçamento e dashboard anual | Automações externas adicionais |

Algumas definições precisam ser explícitas desde o início:

- **Pix é um meio de pagamento.** Pode representar receita, despesa, transferência própria, pagamento de compromisso ou recebimento de reembolso.
- **Pagamento de fatura é liquidação de obrigação.** A despesa já está representada pelas compras e encargos correspondentes.
- **Recebimento previsto e dinheiro recebido são informações diferentes.**
- **Ausência de informação não equivale a zero.** Isso vale para saldo, limite disponível, total da compra e quantidade de parcelas.
- **“Realizado” precisa de contexto.** Uma compra pode estar registrada e faturada, mas ainda não paga.

Recomenda-se começar com valores de liquidação em **BRL**, mantendo moeda explícita no modelo. Compras internacionais poderão preservar valor e moeda originais quando informados, mas sua contabilização dependerá do valor efetivamente cobrado em reais.
