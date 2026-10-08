# Identidade e isolamento — RF-013

## Escopo

Cadastro por email/senha, login/logout, sessão persistida, expiração/revogação, recuperação de senha de uso único e confirmação de email. Better Auth gerencia credenciais; Prisma 7 e PostgreSQL persistem os dados. O hash de senha é responsabilidade da biblioteca; não criar criptografia própria.

Usar o mesmo origin do frontend para `/api`. Cookies HttpOnly/SameSite=Lax; Secure em HTTPS. Em produção, exigir HTTPS, segredo forte e configuração de email explícita; nunca usar o segredo fictício de desenvolvimento. Desabilitar cache de cookie de sessão para que revogação no banco tenha efeito imediato. Sessões expiram em sete dias, renováveis após um dia; tokens de recuperação em 30 minutos, com revogação de todas as sessões após troca de senha.

Emails locais são capturados por Mailpit, sem envio externo. Nenhum token/senha deve ser escrito nos logs. Cadastro exige verificação antes do login; a UI exibe instruções de confirmação. Configuração de SMTP real e domínio público são requisitos de implantação, não contratação nesta task.

## Rotas

| Rota | Acesso e comportamento |
|---|---|
| `/api/auth/*` | Handler oficial Better Auth; cadastro, login, logout, sessão, email e recuperação |
| `GET /api/me` | Sessão válida; somente projeção pública do próprio usuário |
| `GET /api/accounts` | Lista cadastros mínimos do proprietário autenticado |
| `POST /api/accounts` | Cria somente nome de conta; dono vem da sessão, não do corpo |
| `GET /api/accounts/:id` | Busca por ID e proprietário; 404 para inexistente ou de outro usuário |
| `PATCH /api/accounts/:id` | Altera somente nome com escopo de proprietário; exige origem confiável |
| `GET /api/health` | Liveness pública, sem detalhes de configuração |
| `GET /api/ready` | Prontidão do banco, resposta genérica |

O cadastro mínimo de conta existe para provar isolamento em um recurso real e preparar destinos da importação. Não possui saldo, movimentações, cartão, exclusão ou regras financeiras novas nesta task. Não representa a entrega completa de gestão de contas.

## Segurança e persistência

- Autorização por sessão em todas as rotas privadas, negação por padrão. Queries de contas usam `userId` da sessão e retornam apenas campos permitidos.
- Foreign key de conta para usuário e índice composto `(id, userId)`; nenhum endpoint recebe `userId` como campo editável. Referências financeiras compostas serão adicionadas quando existirem entidades relacionadas.
- Migrations versionadas e aplicadas explicitamente; jamais reset automático do banco de desenvolvimento.
- Escritas exigem Origin confiável e JSON; Better Auth mantém suas proteções de origem/CSRF. Bloquear origens desconhecidas, ausência de Origin em escritas e redirects externos.
- Rate limiting persistido para autenticação. Nenhum segredo de sessão em localStorage.
- Testes usam banco dedicado `rovere_test` e schema aleatório por execução, com limpeza restrita ao schema criado pelo próprio teste.

## Validação

Cobrir cadastro/confirmar email/login/logout; sessão ausente, inválida, expirada e revogada; acesso e alteração de conta alheia; corpo tentando forjar proprietário; CSRF; reset inexistente/genérico, expirado e reutilizado; revogação das sessões por reset; limites de requisições; persistência após nova instância da aplicação. E2E verifica o fluxo real no navegador com emails locais.

## Limitações operacionais

Rate limiting usa exclusivamente o IP do peer de conexão, sobrescrevendo o header interno antes do handler; headers enviados pelo cliente não podem alterar essa identidade. Atrás do proxy local, clientes compartilham esse limite. Antes de implantação pública, configurar confiança estrita no proxy/ingress e limitação por cliente; não confiar indiscriminadamente em `X-Forwarded-For`.

Emails são enviados em segundo plano; falhas registram somente `AUTH_EMAIL_DELIVERY_FAILED`. Login de usuário não confirmado reenvia verificação, sujeito ao limite de tentativas. Entrega durável/retry em fila, limpeza periódica de sessões/tokens vencidos, backups, TLS e operação pública ainda precisam de preparação. Mailpit guarda somente dados fictícios e é exposto em loopback.

Readiness verifica conectividade SQL, não integridade financeira. O isolamento implementado está na camada da API e nas referências de proprietário; não há política PostgreSQL RLS. Os módulos futuros precisam repetir a autorização por proprietário e seus testes.

O frontend remove o token de recuperação da URL ao abrir e adota `no-referrer`. Logs brutos de acesso/erro do Nginx local estão desabilitados para não gravar URLs com tokens; antes de implantação pública, preparar observabilidade com redação de dados sensíveis, sem reativar logs de requisições completas.
