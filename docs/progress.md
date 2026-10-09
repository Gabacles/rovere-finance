# Progresso e ponto de retomada

Atualizado em 09/10/2026. Estados, critérios e evidências nas [tasks](tasks/README.md).

## Entrega atual

RF-024 integrada pelo usuário via [PR #11](https://github.com/Gabacles/rovere-finance/pull/11) na main `168c682`; CI final aprovada em `56c047a`. Código/merge/evidências conferidos, mantendo as entregas anteriores e CSV/OFX obrigatórios.

RF-025 concluída localmente na branch `feat/rf-025-card-adjustments`, criada dessa main: ajustes informados imutáveis, reversão compensatória tipada, estorno efetivo associado à compra, custo elegível separado do total/plano e revisão de excedente preservando pagamentos reais. Sem dinheiro livre, refund bancário ou ajustes em terceiros presumidos. [Contrato](card-adjustments.md), [ADR-0013](decisions/0013-traceable-card-adjustments-and-refunds.md), [fase 2](tasks/phase-2.md). Ciclo básico validado dentro dos limites da v0; a V1 inteira ainda não está concluída.

## Validação executada

`npm run check`: 46 documentos/18 tasks e hash histórico, tipos, 113 unitários, builds e smoke aprovados. Integração: 105 aprovados (10 RF-025). Chromium: 11 jornadas, incluindo compra/correções → plano → CSV/OFX → fatura → pagamento → estorno/associação com resposta perdida → excedente 20 preservando pagamento 50 e reserva → unlink/compensatória/reconfirmação, além das regressões de 500 registros por formato. Duas capturas móveis inspecionadas. Evidências, limites e falhas resolvidas na RF-025. Aviso de deprecação do driver pg registrado, sem falha nos testes; revisar antes de upgrade futuro.

Docker atualizado, quatro serviços saudáveis, décima migration aplicada sem reset; schema/banco sem diferenças; proxy público 200 e histórico de estorno 401 sem sessão. Implementação `9c9edf3` publicada no [PR #12](https://github.com/Gabacles/rovere-finance/pull/12); CI remota ainda a conferir antes de integrar. Registro posterior somente de documentação preserva código validado.

## Próxima ação concreta

1. Revisar [PR #12](https://github.com/Gabacles/rovere-finance/pull/12) da RF-025 para main; conferir head/CI e autorização específica antes de integrar.
2. Após integração, RF-026: documentação interativa OpenAPI/Swagger dos contratos reais, antes da fase 3. Atualmente somente contratos Markdown.
3. Depois de RF-026, detalhar próxima fatia da fase 3: recorrências/receitas/terceiros, respeitando os módulos e limites já definidos. Saldo anterior, financiamento e obrigações consolidadas continuam fora do ciclo básico desta v0, sem inferências automáticas.

## Políticas e ambiente

BIZ-02/BIZ-04/BIZ-05 resolvidas por delegação: encargos informados sem juros presumidos, CSV/OFX genéricos até layouts comprovados, revisão explícita de excedentes de reembolso. [Políticas](v0-policies.md). BIZ-01/BIZ-03 preservadas. Retenção continua proposta técnica/de privacidade; não há decisão BIZ bloqueante nesses limites.

Serviços ativos: PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP 11025 e Mailpit 18025. Volume preservado; testes somente em schemas próprios de `rovere_test`. Sem usuários predefinidos ou envio externo. [README](../README.md).
