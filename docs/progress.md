# Progresso e ponto de retomada

Atualizado em 14/10/2026. Estados, critérios e evidências nas [tasks](tasks/README.md).

## Entrega atual

RF-027 integrada pelo [PR #14](https://github.com/Gabacles/rovere-finance/pull/14), merge `a46b9f2` na main conferido por fetch; código igual ao head validado `546e205`. RF-026/PR #13 permanece integrada em `a5b0b62`. Evidências anteriores nas fases 2/3, sem reatribuir testes históricos à RF-028.

RF-028 concluída e validada na branch `feat/rf-028-income-settlements`, criada da main em `a46b9f2`. P3-03 aprovada expressamente pelo usuário: parcial/múltiplos movimentos, excedente sem alocação até revisão e nenhuma quitação automática abaixo do previsto. [Contrato canônico](income-settlements.md) e [ADR-0015](decisions/0015-explicit-income-settlements.md).

Implementados domínio puro, confirmação bancária comum de direção/magnitude, migration aditiva/backfill, IncomeSettlement tipada, disponibilidade conjunta com faturas, API/UI, histórico unificado, idempotência/versões e OpenAPI com 95 operações. Previsão não movimenta caixa; recebimento vincula somente movimento existente CSV/OFX. Reversão libera reserva preservando movimento/histórico. Guardas impedem cancelar ou limpar/reduzir previsto abaixo do recebido sem revisar explicitamente os vínculos. [Task/evidências](tasks/phase-3.md).

RF-029 a RF-036 e P3-01/P3-02/P3-04 a P3-07 permanecem pendentes. Nenhuma recorrência, terceiro, orçamento, baixa automática ou novo provedor nesta entrega. Abertura do PR para main autorizada ao concluir; merge/push direto na main não autorizado. Commit/push e PR RF-028 são a próxima ação desta entrega, já autorizados.

## Conferência e validação

RF-028 final: npm run check aprovado (52 documentos/28 tasks, tipos, 159 unitários/17 suites, builds, 95 operações OpenAPI e smoke); integração completa com 135 testes/15 suites e E2E completo com 14 jornadas aprovados. Incluem CSV/OFX, ciclo de cartão e Swagger, upgrade preservando dados antigos fictícios, concorrência entre módulos, rollback/replay e recebimentos/reversões pela UI. Capturas móveis inspecionadas. Docker atualizado saudável, migration aplicada sem reset do volume e rotas protegidas; diff check aprovado. Evidências/falhas corrigidas na task.

RF-027 histórica: check (146 unitários), integração (118 testes/12 suites), E2E (13 jornadas), Docker e diff check aprovados na entrega correspondente. Esses resultados não comprovam a RF-028. O código integrado foi comparado, sem refazer trabalho validado desnecessariamente.

## Próxima ação concreta

1. Commit/push da versão validada e abertura do PR RF-028 para main conforme autorização; conferir CI remota.
2. Revisar PR/CI antes de integração com autorização específica; não fazer merge ou push direto na main.
3. Após revisão/integração autorizada, detalhar próxima fatia e resolver somente as decisões dependentes antes de implementar. Não avançar outras tasks nesta entrega.

## Políticas e ambiente

BIZ-01 a BIZ-05 preservadas; P3-03 aprovada em [recebimentos](income-settlements.md). [Políticas da v0](v0-policies.md) e [pendências](decisions/pending.md). Sem saldo/limite presumido, financiamento, transferência própria ou imposto inferido.

Node 24.14.0/npm 11.9.0 via `C:/nvm4w/nodejs` requerem execução autorizada fora do sandbox. Docker db/Mailpit iniciados, volume preservado. Testes somente em schemas próprios de `rovere_test`, dados fictícios e email local; migration RF-028 aplicada no ambiente Docker local sem reset do volume. Portas usuais: banco 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP 11025, Mailpit 18025. Aviso pg de consultas concorrentes permanece para revisão antes de upgrade. [Comandos](../README.md).

Histórico HTTP mostra últimas 20 versões, journal integral no banco. Recuperação conserva dados/chave enquanto tela montada, sem persistir rascunho financeiro após reload. Direção confirmada é permanente nesta fatia, inclusive após reversão; revisão de direção fica para fluxo futuro explícito. TLS/implantação pública não homologados.
