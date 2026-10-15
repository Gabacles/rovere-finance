# Progresso e ponto de retomada

Atualizado em 15/10/2026. Estados, critérios e evidências nas [tasks](tasks/README.md).

## Solicitação atual

Após o [diagnóstico da V1](v1-review.md), o usuário testou a interface, rejeitou apresentação/usabilidade como V1 e autorizou continuar as tasks funcionais. Reformulação visual/navegação e validação perceptível obrigatórias no aceite conforme [UX](ux.md). RF-030 em andamento; P3-02 aprovada expressamente em 15/10/2026.

## Estado conferido

RF-027 a RF-029 integradas. Fetch e GitHub confirmaram o [PR #16](https://github.com/Gabacles/rovere-finance/pull/16) na main `9fb9de3`. Comparação com `c24738c` sem diferenças em apps/packages/scripts/tests/CI/manifests/OpenAPI. [CI do head final aprovada](https://github.com/Gabacles/rovere-finance/actions/runs/38801137262/job/116650159190) e [CI do merge aprovada](https://github.com/Gabacles/rovere-finance/actions/runs/38805382190/job/116664764032). RF-026/PR #13, RF-027/PR #14 e RF-028/PR #15 permanecem integradas.

Já há aplicação funcional com interface, API e banco para importação CSV/OFX, ciclo básico de cartão, receitas avulsas/recebimentos e geração mensal de receitas. A interface reúne os módulos numa página longa; não há ainda navegação principal ou dashboard anual. A V1 está incompleta. Fases 0/1/2 e RF-027 a RF-029 têm evidências; RF-030 em andamento; RF-031 a RF-036 permanecem pendentes e fases 4/5 ainda são macro. Contagem de tasks não representa percentual da V1.

A revisão apontou cobertura ainda sem entregas concretas para lançamentos bancários manuais, transferências próprias, saldos de referência/limites e calendário/estimativas. São lacunas do plano a detalhar, não requisitos dispensados nem funcionalidades aprovadas por esta revisão. Terceiros, categorias/orçamento e visão anual continuam faltando. README/domínio e registros de merge/CI desatualizados foram corrigidos.

## Validações e limites

Última implementação validada `fc38e03`: check com 194 unitários/18 suites, 146 integrações/17 suites, 15 jornadas E2E, builds/OpenAPI com 101 operações, smoke e Docker aprovados; evidências completas na [RF-029](tasks/phase-3.md). Não foram reexecutados nesta revisão documental; o código integrado foi comparado e a CI do merge foi conferida.

Na revisão V1 anterior, sem alterações funcionais: Docker ps confirmou db/API/web saudáveis; HTTP HTML/ready/OpenAPI 200. Chromium confirmou cadastro, email local, login/logout e os sete blocos principais com conta fictícia, sem criar registros financeiros. Capturas inspecionadas: página autenticada com 6.427 px na viewport 1280×900, sem estouro horizontal nem erro JavaScript. Artefatos locais ignorados em test-results/v1-review-*.png. `npm run docs:check` aprovado: 55 documentos/28 tasks, links e SHA-256 do histórico original verificados. `git diff --check` aprovado; a comparação naquele ponto confirmou código/contrato sem alterações.

Branch `feat/rf-030-recurrence-lifecycle` criada de origin/main `9fb9de3`, levando intactos os ajustes documentais locais da revisão. [Contrato RF-030](recurrence-lifecycle.md)/[ADR-0017](decisions/0017-explicit-recurrence-lifecycle.md). Domínio, migration aditiva, API/UI funcional, histórico, idempotência/versões e OpenAPI 106 operações implementados. Validações locais finais aprovadas: check (57 documentos/28 tasks, 205 unitários/19 suites, tipos/builds/OpenAPI/smoke); integração (158 testes/19 suites); E2E (16 jornadas), Docker e diff check. Incluem upgrade/replay RF-029 preservado, concorrência, rollback, CSV/OFX/cartão, correções/recebimentos e validação monetária perceptível. Falhas corrigidas registradas na task. Prévia+alteração de 120 ocorrências: 530 ms no PostgreSQL local, sem promessa de produção. Staging/revisão/publicação ainda pendentes, sem commit/push/PR RF-030. P3-01/P3-02/P3-03 aprovadas; P3-04 a P3-07 continuam pendentes. Previsões não movimentam caixa.

## Próxima ação concreta

1. Revisar staged diff/segredos; validações locais RF-030 aprovadas.
2. Registrar resultados reais/limitações na task, revisar diff/segredos e publicar branch/PR conforme autorização persistente, sem merge/push direto para main.
3. RF-031 permanece pendente nesta entrega. Depois de revisão/integração, decidir P3-04 antes de implementar despesas recorrentes. As lacunas da V1 e o redesign obrigatório continuam no mapa; não considerar a V1 fechada ao terminar RF-036.

## Ambiente e políticas

Node 24.14.0/npm 11.9.0 via C:/nvm4w/nodejs; execução autorizada fora do sandbox. Docker local com volume preservado e migrations RF-029/RF-030 aplicadas. Portas: banco 15432, API 3100, frontend 18080, SMTP 11025, Mailpit 18025. [Comandos](../README.md).

BIZ-01 a BIZ-05 preservadas. [Políticas da v0](v0-policies.md), [recorrências](recurring-incomes.md), [recebimentos](income-settlements.md) e [pendências](decisions/pending.md). Histórico HTTP limitado às últimas 20 decisões, journal integral no banco; recuperação conserva chave/dados enquanto a tela estiver montada. Avisos preexistentes pg e NO_COLOR/FORCE_COLOR registrados na task. Não há evidência nova de implantação pública, TLS, backup/restauração ou capacidade de produção.
