# Progresso e ponto de retomada

Atualizado em 15/10/2026. Estados, critérios e evidências nas [tasks](tasks/README.md).

## Solicitação atual

Após o [diagnóstico da V1](v1-review.md), o usuário testou a interface, rejeitou apresentação/usabilidade como V1 e autorizou continuar as tasks funcionais. Reformulação visual/navegação e validação perceptível obrigatórias no aceite conforme [UX](ux.md). Usuário informou o merge do PR #17 e autorizou RF-031. P3-04 aprovada expressamente em 15/10/2026; bloqueio anterior encerrado. [Contrato](recurring-expenses.md)/[ADR-0018](decisions/0018-explicit-recurring-expenses.md).

## Estado conferido

RF-027 a RF-030 integradas. Fetch e GitHub confirmaram o [PR #17](https://github.com/Gabacles/rovere-finance/pull/17) na main `30db902`. Comparação com o head final `e6e2cde` sem diferenças em apps/packages/scripts/tests/CI/manifests/OpenAPI. [CI do head final aprovada](https://github.com/Gabacles/rovere-finance/actions/runs/38816907749/job/116703777097); [CI do merge aprovada](https://github.com/Gabacles/rovere-finance/actions/runs/38822219529/job/116721240587), conclusão conferida após a consulta inicial em andamento. Evidências anteriores dos PRs #13 a #16 preservadas nas respectivas tasks.

Já há aplicação funcional com interface, API e banco para importação CSV/OFX, ciclo básico de cartão, receitas avulsas/recebimentos, ciclo mensal de receitas e despesas recorrentes. A interface reúne os módulos numa página longa; não há ainda navegação principal ou dashboard anual. A V1 está incompleta. Fases 0/1/2 e RF-027 a RF-030 integradas; RF-031 concluída/validada na branch da task para revisão; RF-032 a RF-036 pendentes e fases 4/5 ainda são macro. Contagem de tasks não representa percentual da V1.

A revisão apontou cobertura ainda sem entregas concretas para lançamentos bancários manuais, transferências próprias, saldos de referência/limites e calendário/estimativas. São lacunas do plano a detalhar, não requisitos dispensados nem funcionalidades aprovadas por esta revisão. Terceiros, categorias/orçamento e visão anual continuam faltando. README/domínio e registros de merge/CI desatualizados foram corrigidos.

## Validações e limites

RF-030 validada em `f04c00b`, incorporada sem alteração funcional no head `e6e2cde` e no merge `30db902`; evidências anteriores preservadas na task. RF-031 validada localmente em `01e11fc`: check com 59 documentos/28 tasks, 211 unitários/20 suites, tipos/builds/OpenAPI 113 operações/smoke; 171 integrações/21 suites; 17 jornadas Chromium; Docker/configuração/migration/status e diff check aprovados. Evidências completas na [RF-031](tasks/phase-3.md), incluindo falhas corrigidas e limites. Registro posterior somente documental, sem modificar o código validado.

Na revisão V1 anterior, sem alterações funcionais: Docker ps confirmou db/API/web saudáveis; HTTP HTML/ready/OpenAPI 200. Chromium confirmou cadastro, email local, login/logout e os sete blocos principais com conta fictícia, sem criar registros financeiros. Capturas inspecionadas: página autenticada com 6.427 px na viewport 1280×900, sem estouro horizontal nem erro JavaScript. Artefatos locais ignorados em test-results/v1-review-*.png. `npm run docs:check` aprovado: 55 documentos/28 tasks, links e SHA-256 do histórico original verificados. `git diff --check` aprovado; a comparação naquele ponto confirmou código/contrato sem alterações.

Branch atual `feat/rf-031-recurring-expenses`, criada de origin/main `30db902` com diretório limpo. Ajustes locais da preparação preservados. Domínio puro reutiliza calendário/ciclo; quatro tabelas tipadas aditivas, API/UI, histórico legível, versões/idempotência e OpenAPI. Confirmação cria/vincula uma Expense; correções posteriores preservam fatos e sinalizam revisão. Implementação `01e11fc` publicada; [PR #18 aberto para main](https://github.com/Gabacles/rovere-finance/pull/18). [CI remota](https://github.com/Gabacles/rovere-finance/actions/runs/38832688689/job/116754782142) em execução na consulta inicial, a conferir no head final. Nenhum merge/push direto para main. P3-01/P3-02/P3-03/P3-04 aprovadas; P3-05 a P3-07 continuam pendentes. Previsões não movimentam caixa.

Regressões CSV/OFX, ciclo de cartão e receitas preservadas. Upgrade testado comparou todas as tabelas anteriores, fatos e replay sem reescrita. Comparação semântica OpenAPI manteve as 88 rotas/50 schemas anteriores. Geração+alteração de 120 ocorrências: 326 ms no PostgreSQL local, sem promessa de capacidade em produção. Captura móvel RF-031 inspecionada; frontend funcional continua sujeito ao redesign obrigatório. Nenhuma evidência nova de implantação pública.

## Próxima ação concreta

1. Revisar [PR #18](https://github.com/Gabacles/rovere-finance/pull/18) e conferir CI do head final; validações locais RF-031 aprovadas.
2. Após revisão/merge, próxima task RF-032 (cadastro privado de terceiros). Não implementá-la nem propostas P3-05 a P3-07 nesta branch.
3. Preservar as lacunas da V1 e o redesign obrigatório no mapa; não considerar a V1 fechada ao terminar RF-036.

## Ambiente e políticas

Node 24.14.0/npm 11.9.0 via C:/nvm4w/nodejs; execução autorizada fora do sandbox. Docker local com volume preservado e 15 migrations aplicadas, incluindo RF-031; db/API/web/Mailpit saudáveis. HTML/ready/OpenAPI 200, nova rota privada 401/no-store. Portas: banco 15432, API 3100, frontend 18080, SMTP 11025, Mailpit 18025. [Comandos](../README.md).

BIZ-01 a BIZ-05 preservadas. [Políticas da v0](v0-policies.md), [recorrências](recurring-incomes.md), [recebimentos](income-settlements.md) e [pendências](decisions/pending.md). Histórico HTTP limitado às últimas 20 decisões, journal integral no banco; recuperação conserva chave/dados enquanto a tela estiver montada. Avisos preexistentes pg e NO_COLOR/FORCE_COLOR registrados na task. Não há evidência nova de implantação pública, TLS, backup/restauração ou capacidade de produção.
