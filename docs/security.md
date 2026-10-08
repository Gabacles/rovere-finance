# Segurança, privacidade e operação

> Arquitetura geral aprovada em 08/10/2026. Este documento define o destino planejado; consulte [progresso](progress.md) e [tasks](tasks/README.md) para saber o que está implementado.

A autorização será aplicada a todas as consultas e comandos, incluindo downloads, prévias e tarefas assíncronas. O usuário autenticado virá da sessão, sem confiar num `user_id` enviado pelo cliente.

RF-013 implementa sessões persistidas e revogáveis, cookies `HttpOnly`/`SameSite=Lax` (`Secure` quando HTTPS), proteção CSRF, expiração e recuperação de acesso com tokens de uso único via Better Auth. HTTP é permitido exclusivamente para desenvolvimento. Contrato, isolamento e limitações em [identidade](identity.md). [Documentação de sessões](https://better-auth.com/docs/concepts/session-management)

Os arquivos importados terão armazenamento privado, nomes internos aleatórios, prazo de retenção e limites de tamanho, linhas, tempo e memória. O parsing XML deverá desabilitar entidades externas e acesso à rede. Conteúdo importado será tratado como texto; exportações para planilhas deverão neutralizar fórmulas maliciosas.

A aplicação terá validação no servidor, rate limiting, TLS, segredos fora do repositório e criptografia em repouso. Tokens futuros de provedores receberão proteção adicional, com chaves mantidas fora do banco.

Logs operacionais registrarão IDs técnicos, duração, quantidade de linhas e códigos de erro, evitando descrições financeiras, arquivos, senhas e tokens. Auditoria financeira terá acesso e retenção próprios.

A LGPD exige considerar finalidade, necessidade, transparência, direitos do titular e medidas de segurança. A base legal de cada tratamento e os papéis dos fornecedores deverão ser definidos antes de disponibilizar o serviço a terceiros; consentimento de Open Finance não substitui essa análise. [Texto da LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)

Como proposta operacional inicial: excluir arquivos brutos após prazo curto, como 30 dias, mantendo a rastreabilidade mínima necessária; oferecer exportação e exclusão de conta; ter backups criptografados e testar restauração. Prazos definitivos dependem da política aprovada.

Docker Compose incluirá frontend, backend, processador de tarefas e PostgreSQL. Migrações terão execução controlada, e a carga de demonstração será separada das migrações. Observabilidade inicial cobrirá disponibilidade, duração das importações, filas, falhas e conflitos de conciliação.
