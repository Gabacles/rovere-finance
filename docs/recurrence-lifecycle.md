# Ciclo de vida de receitas recorrentes — RF-030

P3-02 aprovada expressamente em 15/10/2026. Complementa [geração RF-029](recurring-incomes.md) e mantém as guardas de [recebimentos RF-028](income-settlements.md). Não cria caixa nem implementa RF-031.

## Regra e programação

Separar correção individual de alteração futura da regra. Toda ação usa prévia atual, versões, confirmação explícita e Idempotency-Key; transação/journals são atômicos sob a trava User existente. Datas passadas, exceções individuais, receitas canceladas e ocorrências com recebimentos ativos são preservadas em alteração de série. A prévia explica cada preservação.

Estados active/paused/cancelled. Pausar bloqueia novas gerações e preserva receitas existentes; retomar só reativa, sem gerar ou recompor lacunas. Cancelar a série é definitivo, bloqueia novas gerações e conserva receitas já criadas; cancelar cada receita é ação individual, recusada enquanto houver recebimentos ativos. Nenhuma operação apaga regra/ocorrência/histórico ou recria canceladas.

Edição futura informa competência inicial fromPeriod (não anterior ao mês atual de America/Sao_Paulo), descrição, notas, valor fixo BRL, âncora e fim explícito. Início original permanece. Programações são revisões imutáveis; a programação inicial recebe backfill na migration. Cada mês usa a revisão com maior competência inicial aplicável; empate usa a versão mais recente. Uma revisão anterior não substitui outra programada para mês posterior. Os campos principais da regra mostram a revisão mais recentemente cadastrada; a lista de programações explica o calendário efetivo por competência.

Para receitas já geradas, a prévia cobre todas as ocorrências: atualiza somente não canceladas, sem exceção individual/recebimento e com data atual e nova estritamente posteriores ao dia atual. Futuros fora da nova vigência ou regidos por revisão posterior são preservados com motivo, sem cancelamento implícito. Receitas preservadas poderão ser corrigidas/canceladas individualmente por nova decisão. A referência de dia é calculada pelo servidor em America/Sao_Paulo e integra o hash; virada de dia exige nova prévia. O domínio recebe a data civil como argumento.

ScheduledOccurrence guarda para sempre data/valor/programação/evidência da geração original. Correções são fatos atuais da Income com novas versões e histórico; não reescrevem a origem. Marcador imutável de exceção identifica a primeira correção individual, evitando sobrescrita posterior por série, inclusive após reversão de recebimentos. A unicidade regra/período permanece.

## Correção individual

Selecionar ocorrência da própria regra. Edição usa os mesmos campos/normalização da previsão avulsa: descrição/notas e fatos de data/valor que podem ser explicitamente desconhecidos. Não altera a programação nem outras ocorrências. Correção em data passada é permitida somente nessa ação explícita. Cancelamento é terminal. Com recebimento, é recusado cancelar, limpar o valor ou reduzir abaixo do recebido; revisão mostra valores/vínculos e exige confirmação. Movimento bancário, direção, reservas e recebimentos não são apagados nem redistribuídos.

## HTTP e interface

Além das rotas RF-029: GET /api/income-recurrences/:id/occurrences?page=1 (25 por página); POST /:id/change-preview e /:id/change para edit/pause/resume/cancel; POST /:id/occurrences/:incomeId/change-preview e /change para edit/cancel individual. Prévia é leitura autenticada com Origin/JSON. Confirmação exige expectedVersion, previewHash, changeConfirmed:true e chave; individual exige também expectedIncomeVersion. Payload diferente com mesma chave conflita; replay retorna resultado original, e UI consulta a projeção atual. Histórico HTTP limitado às últimas 20 decisões, journal integral no banco.

UI funcional distingue alcance de série/ocorrência, mostra dados antes/depois e motivos de preservação, estado, programações e recebimentos antes de confirmar. Recupera respostas incertas com chave/corpo originais e exige nova prévia após conflito. Reformulação visual/navegação final continua obrigatória conforme [UX](ux.md); não confundir a interface incremental com aceite visual da V1.

Testes/evidências e limites reais na [task RF-030](tasks/phase-3.md). SQL migra sem reset, preserva dados/replays RF-029 e não altera CSV/OFX ou políticas monetárias.
