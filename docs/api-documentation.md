# Documentação interativa da API — RF-026

## Acesso e uso

Swagger UI em `/api/docs`; JSON OpenAPI 3.1.1 em `/api/openapi.json`. Use **a origem do frontend**, que encaminha `/api` sem mudar as proteções: [Vite local](http://localhost:5173/api/docs) ou [Docker local](http://127.0.0.1:18080/api/docs). A porta direta da API permite leitura local da documentação, mas escritas de outra origem são rejeitadas. O [snapshot versionado](api/openapi.json) também pode ser consultado offline.

Cadastre uma conta fictícia, confirme email pelo Mailpit e faça login na aplicação. Ao abrir Swagger nessa mesma origem, o navegador reutiliza o cookie HttpOnly. Não cole token/senha em Authorize: não há JWT/bearer. HTTP local usa `better-auth.session_token`, HTTPS usa `__Secure-better-auth.session_token`; o JSON servido informa o nome da configuração efetiva. Logout/revogação afetam imediatamente os testes na UI.

Try it out executa operações **reais** da API. Use somente dados fictícios e revise corpo/IDs/competências antes de executar. IDs dos exemplos são fictícios; substitua pelos recursos da sua sessão. Leia o estado/versão atual antes de escrever. Mesma `Idempotency-Key` e corpo/versões originais recuperam respostas perdidas; outra decisão exige chave nova. Não aplicar nova chave indiscriminadamente após erro de rede.

CSV/OFX: selecione arquivo em `file`, informe `format` e preencha `configuration` com **texto JSON**. Exemplo CSV no schema; OFX aceita `{}` ou encoding explícito. O navegador inclui o boundary multipart. Parsing assíncrono; consulte lote, escolha destinos por bloco, revise linhas, obtenha prévia e confirme a versão. Upload/consulta não criam movimentos. [Revisão](import-review.md) e [confirmação](import-confirmation.md).

## Contratos e manutenção

Documentação financeira em [schemas](../apps/api/src/openapi/schemas.ts), [importação](../apps/api/src/openapi/import-schemas.ts) e [operações](../apps/api/src/openapi/operations.ts). [Geração](../apps/api/src/openapi/document.ts) obtém paths/métodos/parâmetros/guardas dos mesmos controllers registrados pelo Nest. `operationId` financeiro estável: `Controller_método`; mudança intencional de nome é mudança do contrato. Entradas atuais continuam sendo validadas pelo domínio/serviços, sem dependência de OpenAPI no domínio.

Identidade usa o gerador da versão instalada do Better Auth **somente em memória**, sem registrar plugin ou publicar `/auth/reference`/`open-api/generate-schema`. Separa modelos de autenticação com prefixo Auth, corrige `nullable` residual e imagem de usuário anulável para JSON Schema 3.1 e declara cookie efetivo, política de senha/origem e erros reais. Os fluxos email/senha usados pela aplicação ficam em Identidade. Rotas internas do handler ficam em Identidade — biblioteca; OAuth/social e exclusão de usuário não estão configurados e não representam funcionalidades concluídas. Não habilitar funcionalidades de identidade para tornar um exemplo executável.

Centavos são strings canônicas em BRL/BIGINT, datas civis separadas de instantes, unknown separado de zero. Versões, confirmações, paginação, erros de origem, sessão, conflito e upload estão documentados; schemas de origem/journal permitem JSON variável preservado. As validações cruzadas (magnitude, calendário gregoriano, overflow, propriedade, soma/limite) continuam no servidor e nos contratos Markdown dos módulos. Não gerar SDK de rotas futuras.

Após alterar um contrato HTTP, atualize schema/operação, execute `npm run api:docs:generate`, revise o diff do snapshot e valide com `npm run check`. `api:docs:check`, incluído no check/CI, valida OpenAPI localmente, referências, IDs únicos, inventário e snapshot; não abre conexão com banco. Rotas novas/removidas, mudanças na presença de Body/Query/guardas sem documentação falham. O snapshot também detecta mudanças nos contratos gerados pela biblioteca. Integração compara respostas reais de operações representativas aos schemas; não substitui testes de domínio, autorização ou financeiro.

## Política de exposição

`API_DOCS_ENABLED`: `true`/`false`; valores inválidos impedem inicialização. Desenvolvimento habilitado por padrão, documentação pública local sem conteúdo de usuários. Produção desabilitada por padrão (UI, JSON e assets não registrados). Habilitação explícita em produção exige sessão persistida válida em **todas** essas rotas; faça login pela aplicação primeiro. A configuração de produção continua exigindo HTTPS/segredo próprio. Exemplos na `.env.example`/Compose são exclusivos de desenvolvimento.

UI/assets hospedados localmente com allowlist, CSP, `no-store` e `no-referrer`; sem CDN, validador externo, persistência de autorização ou CORS permissivo. O browser envia credenciais somente na mesma origem. Não desabilitar CSRF/Origin/guardas/limites para exercitar Swagger. Não há execução de infraestrutura nova, migration ou modificação das regras financeiras nesta task.

Escolha técnica: `swagger-ui-dist` 5.33.0 e validador OpenAPI 13.1.0 compatíveis com a stack instalada. `@nestjs/swagger` 12.0.2 declara peer TypeScript `^5.5 || ^6`, enquanto o projeto usa 7.0.2; evitou-se ignorar peers ou trocar a stack. Inventário é lido da metadata Nest real, com schemas HTTP explícitos. Referências verificadas em 14/10/2026: [Nest OpenAPI](https://docs.nestjs.com/openapi/introduction), [release/peers](https://github.com/nestjs/swagger/releases/tag/12.0.2), [Better Auth](https://better-auth.com/docs/plugins/open-api), [Swagger UI](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/), [validador](https://github.com/APIDevTools/swagger-parser).
