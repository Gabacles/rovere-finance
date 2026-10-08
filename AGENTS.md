# Instruções para agentes — Rovere Finance

## Antes de trabalhar

1. Leia [docs/progress.md](docs/progress.md), [roadmap](docs/roadmap.md) e os [estados das tasks](docs/tasks/README.md).
2. Leia a [arquitetura](docs/architecture.md), o [domínio](docs/domain.md), os [contratos](docs/contracts.md) e os ADRs relevantes à atividade.
3. Inspecione código, manifests e testes existentes. Documentação de intenção não comprova implementação.
4. Compare o progresso registrado com arquivos e resultados reais. Investigue divergências, corrija o registro e só então continue.
5. Retome a task interrompida ou a próxima task sem dependências pendentes. Não refaça trabalho validado desnecessariamente.

## Autorização e limites

- A arquitetura geral e a implementação incremental foram aprovadas em 08/10/2026. Não pedir novamente a mesma aprovação.
- Trabalhe em entregas pequenas e verificáveis. O pedido inicial não autoriza tentar construir toda a V1 numa única etapa.
- Apresente recomendação para decisões financeiras ainda abertas antes de implementar comportamentos dependentes. Continue tarefas independentes.
- Projeto greenfield: não reutilizar nem investigar o projeto anterior.
- CSV e OFX são obrigatórios na V1. Open Finance é futuro, somente leitura e não pode bloquear o MVP.
- Não invente parcelas, total de compra, fatura, saldo ou limite ausentes. Preserve origem, incerteza, correções manuais e confirmação explícita.
- Regras de domínio não dependem de React, NestJS ou ORM. Dinheiro nunca utiliza ponto flutuante em cálculos.
- Use dados fictícios. Nunca versionar arquivos financeiros pessoais, tokens, credenciais ou segredos.

## Fonte de verdade e conclusão

- [Índice do planejamento](PLANEJAMENTO_ARQUITETURA.md) aponta para o documento canônico de cada assunto.
- O estado de uma task, seus critérios e evidências pertencem ao arquivo da fase em `docs/tasks/`. `docs/progress.md` resume o ponto de retomada com links, sem reproduzir todos os checklists.
- Estados permitidos: `pendente`, `em andamento`, `bloqueada`, `concluída`. Bloqueio exige motivo e condição para desbloqueio.
- Use `[ ]`/`[x]`. Só marque uma task concluída quando implementação, integração, testes necessários e critérios de aceite estiverem verificados. Código escrito ou teste não executado não é entrega concluída.
- Registre comandos, resultados, limitações e links à implementação. Se houver falha, registre-a e mantenha pendentes os critérios afetados.
- Antes de encerrar ou interromper: atualize a task, `docs/progress.md`, o que falta e a próxima ação concreta. Não atribua resultados de testes a uma versão diferente do código.
- Mudanças de arquitetura ou de regras devem atualizar o documento canônico e, quando importantes, um ADR. Não duplicar a regra completa no ADR; registrar decisão, contexto, consequências e link.
- O arquivo `docs/archive/2026-10-08-planejamento-original.md` é histórico e imutável; a aprovação e as decisões posteriores prevalecem.

## Execução e validação

Consulte [README.md](README.md) para os comandos atuais. Execute validações proporcionais à mudança e registre resultados reais. Não alegar que Docker, banco, frontend ou integração funcionaram se não foram executados.

Não criar commits, publicar, contratar provedores ou alterar o escopo para contornar uma pendência sem instrução aplicável. A continuidade deve ser possível pelo repositório, sem depender do histórico do chat.
