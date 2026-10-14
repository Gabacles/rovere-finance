import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { openAPI } from 'better-auth/plugins';
import type { Identity } from '../identity/auth.js';
import { operations } from './operations.js';
import { importSchemas } from './import-schemas.js';
import { date, id, nullable, ref, schemas, str } from './schemas.js';
import type { Schema } from './schemas.js';

export interface Document { openapi: string; info: { title: string; version: string; description: string }; servers: { url: string }[]; tags: { name: string }[]; paths: Record<string, Record<string, Schema>>; components: { schemas: Record<string, Schema>; securitySchemes: Record<string, Schema> } }
export const description = `API v0 — dados fictícios para exemplos. Dinheiro em strings de centavos BRL; datas civis não são instantes. Lacunas continuam unknown.

Abra esta documentação pela mesma origem do frontend. Cadastre/confirme email/faça login na aplicação, então retorne à UI: o navegador envia o cookie HttpOnly automaticamente. Não cole token no botão Authorize. HTTPS usa __Secure-better-auth.session_token; HTTP local usa better-auth.session_token. Sessões persistidas, 7 dias; recuperação 30 minutos e revoga sessões. Não há JWT/bearer nem provedor social configurado.

Escritas exigem Origin igual a APP_ORIGIN e application/json, exceto upload multipart em POST imports. A UI usa a origem atual; acesso direto à porta da API não habilita escritas se for outra origem. Guardas, CSRF e limites continuam ativos. Respostas financeiras são privadas e no-store. POST normalmente retorna 201, inclusive replay; Better Auth retorna 200.

Idempotency-Key quando indicado: 1–100 caracteres A–Z/a–z/0–9/_/-. Para recuperar resposta perdida, repita chave e corpo/versões originais; outro payload gera 409. Conflito de versão: releia o recurso, revise a decisão e use nova chave. Fatos de fatura e revisão de importação usam versões sem chave; cadastro/rename bancário não promete idempotência.

Conhecimento completo, conciliação, pagamento e cobertura são dimensões distintas. Receitas previstas avulsas não movimentam caixa; recebimentos vinculam movimentos existentes explicitamente, sem duplicar caixa. Recorrências de receitas continuam futuras. Excedente credit_review_required preserva pagamentos reais, não é dinheiro disponível. Rotas futuras de terceiros/orçamento não estão nesta especificação.`;

function errorResponse(description: string, schema: Schema) { return { description, content: { 'application/json': { schema } } }; }
const errorSchema: Schema = { anyOf: [ref('ApiError'), ref('NestError')] };
function normalizeLibrarySchema(value: unknown): unknown {
  if (value === 'https://example.com/callback') return '/';
  if (typeof value === 'string' && value.startsWith('#/components/schemas/')) return value.replace('#/components/schemas/', '#/components/schemas/Auth');
  if (Array.isArray(value)) return value.map(normalizeLibrarySchema);
  if (!value || typeof value !== 'object') return value;
  const next = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'nullable').map(([key, child]) => [key, normalizeLibrarySchema(child)]));
  // The installed generator still emits some 3.0 nullable fields in its 3.1 document.
  return 'nullable' in value && value.nullable === true ? { anyOf: [next, { type: 'null' }] } : next;
}
export function nestDocument(controllers: readonly Function[]): Document {
  const paths: Document['paths'] = {}; const seen = new Set<string>();
  for (const controller of controllers) {
    const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string;
    for (const methodName of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[methodName] as Function;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const operationId = `${controller.name}_${methodName}`; const definition = operations[operationId];
      if (!definition) throw new Error(`OpenAPI missing operation: ${operationId}`);
      seen.add(operationId);
      const path = `/api/${[prefix, Reflect.getMetadata(PATH_METADATA, handler)].filter(value => value && value !== '/').join('/')}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      const verb = RequestMethod[method].toLowerCase();
      const params: Schema[] = [...path.matchAll(/\{([^}]+)\}/g)].map(match => ({ name: match[1], in: 'path', required: true, schema: match[1] === 'number' ? str({ pattern: '^[1-9][0-9]*$' }) : id }));
      const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, methodName) as Record<string, { data?: string }> | undefined;
      const headers = Object.entries(args ?? {}).filter(([key]) => key.startsWith('6:')).map(([, value]) => value.data);
      if (headers.includes('idempotency-key')) params.push({ name: 'Idempotency-Key', in: 'header', required: true, schema: str({ pattern: '^[A-Za-z0-9_-]{1,100}$', example: 'decisao_ficticia_1' }), description: 'Mesma chave e corpo recuperam resposta; outro comando gera 409. Preserve versões originais em retry.' });
      for (const [name, schema] of Object.entries(definition.query ?? {})) params.push({ name, in: 'query', required: definition.requiredQuery?.includes(name) ?? false, schema });
      const bodyArgument = Object.keys(args ?? {}).some(key => key.startsWith('3:'));
      const queryArgument = Object.keys(args ?? {}).some(key => key.startsWith('4:'));
      if (bodyArgument !== !!definition.body || queryArgument !== !!definition.query) throw new Error(`OpenAPI input drift: ${operationId}`);
      const guarded = (Reflect.getMetadata(GUARDS_METADATA, controller)?.length ?? 0) + (Reflect.getMetadata(GUARDS_METADATA, handler)?.length ?? 0) > 0;
      if (guarded === !!definition.public) throw new Error(`OpenAPI access drift: ${operationId}`);
      const writes = !['get', 'head', 'options'].includes(verb);
      const success = verb === 'post' ? '201' : '200';
      const responses: Record<string, unknown> = { [success]: { description: 'Resultado confirmado (ou replay quando há chave).', content: { [definition.binary ? 'application/octet-stream' : 'application/json']: { schema: definition.response } } } };
      if (!definition.public) {
        responses['401'] = errorResponse('Sessão ausente, expirada ou revogada.', errorSchema);
        if (path.includes('{') || definition.requiredQuery?.length) responses['404'] = errorResponse('Recurso inexistente ou de outro proprietário.', errorSchema);
      }
      if (writes || queryArgument) responses['400'] = errorResponse('Campos, formato ou confirmação inválidos.', errorSchema);
      if (writes) {
        responses['403'] = errorResponse('Origem ausente/desconhecida ou formato rejeitado.', ref('ApiError'));
        responses['413'] = errorResponse('Corpo/arquivo excede limite.', errorSchema);
        if (operationId !== 'AccountsController_create' && operationId !== 'AccountsController_rename') responses['409'] = errorResponse('Versão/chave/estado/limites ou dependência em conflito; revalidar decisão.', errorSchema);
      }
      if (operationId === 'IdentityController_ready') responses['503'] = errorResponse('Banco indisponível.', ref('NestError'));
      responses['500'] = errorResponse('Falha interna; não repetir alteração com nova chave sem conferir o resultado.', errorSchema);
      paths[path] ??= {};
      if (paths[path]![verb]) throw new Error(`OpenAPI duplicated route: ${verb} ${path}`);
      paths[path]![verb] = { operationId, tags: [definition.tag], summary: definition.summary, description: definition.description ?? '', security: definition.public ? [] : [{ sessionCookie: [] }], ...(params.length ? { parameters: params } : {}), ...(definition.body ? { requestBody: { required: true, content: { [definition.multipart ? 'multipart/form-data' : 'application/json']: { schema: definition.body, ...(definition.example ? { example: definition.example } : {}) } } } } : {}), responses };
    }
  }
  for (const key of Object.keys(operations)) if (!seen.has(key)) throw new Error(`OpenAPI obsolete operation: ${key}`);
  return { openapi: '3.1.1', info: { title: 'Rovere Finance — API', version: '0.1.0', description }, servers: [{ url: '/' }], tags: [...new Set(Object.values(operations).map(op => op.tag))].map(name => ({ name })), paths, components: { schemas: { ...schemas, ...importSchemas, CivilDate: date, Magnitude: { ...schemas.Money, properties: { currency: { type: 'string', enum: ['BRL'] }, cents: str({ pattern: '^(0|[1-9][0-9]*)$' }) } } }, securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token', description: 'Sessão HttpOnly enviada pelo navegador na mesma origem; em HTTPS nome __Secure-better-auth.session_token. Faça login pela aplicação.' } } } };
}

export async function completeDocument(controllers: readonly Function[], identity: Identity): Promise<Document> {
  const document = nestDocument(controllers);
  // Execute only the library's schema generator in-process. The plugin is NOT registered
  // with auth, so no extra /auth/reference or /auth/open-api endpoints are exposed.
  const context = await identity.auth.$context;
  document.components.securitySchemes.sessionCookie!.name = context.authCookies.sessionToken.name;
  const librarySchema = await openAPI({ disableDefaultReference: true }).endpoints.generateOpenAPISchema({ context });
  const generated = normalizeLibrarySchema(librarySchema) as typeof librarySchema;
  const primary = new Set(['/sign-up/email', '/sign-in/email', '/sign-out', '/get-session', '/send-verification-email', '/verify-email', '/request-password-reset', '/reset-password', '/reset-password/{token}', '/ok', '/error']);
  for (const [path, methods] of Object.entries(generated.paths)) {
    const fullPath = `/api/auth${path}`; document.paths[fullPath] = {};
    for (const [verb, source] of Object.entries(methods)) {
      if (!['get', 'post', 'patch', 'put', 'delete'].includes(verb)) continue;
      const op = structuredClone(source) as Schema;
      op.operationId = `Identity_${verb}_${path.replace(/[^A-Za-z0-9]+/g, '_')}`;
      op.tags = [primary.has(path) ? 'Identidade' : 'Identidade — biblioteca'];
      op.security = primary.has(path) ? [] : [{ sessionCookie: [] }];
      op.description = `${op.description ?? ''}\n${primary.has(path) ? 'Fluxo email/senha da v0.' : 'Rota do handler Better Auth. OAuth/social e exclusão de usuário não configurados nesta v0; operações dependentes retornam erro. Não representam funcionalidades de produto concluídas.'} Escritas exigem origem confiável e JSON; rate limit persistido: 100/min geral, login 10/min, cadastro/recuperação 5/min por peer. Senha entre 12 e 128 caracteres. Callback de retorno somente origem confiável.`;
      const responses = op.responses as Record<string, unknown>;
      if (path === '/get-session') {
        const response = responses['200'] as { content: Record<string, { schema: Schema }> };
        response.content['application/json']!.schema = nullable(response.content['application/json']!.schema);
      }
      if (op.requestBody) {
        const body = op.requestBody as { content: Record<string, { schema: { properties?: Record<string, Schema> } }>; required?: boolean };
        body.required = true;
        const properties = body.content['application/json']?.schema.properties;
        const passwordField = path === '/sign-up/email' ? 'password' : ['/reset-password', '/change-password'].includes(path) ? 'newPassword' : null;
        if (passwordField && properties?.[passwordField]) Object.assign(properties[passwordField], { minLength: 12, maxLength: 128 });
      }
      for (const status of ['400', '401', '403', '429']) responses[status] = errorResponse(status === '429' ? 'Limite de autenticação excedido.' : 'Erro de identidade/origem/validação; formato da biblioteca.', { anyOf: [ref('ApiError'), ref('NestError')] });
      document.paths[fullPath]![verb] = op;
    }
  }
  // Namespace library refs: its Account is an auth credential, not a bank account.
  for (const [name, schema] of Object.entries(generated.components.schemas)) document.components.schemas[`Auth${name}`] = schema;
  const user = document.components.schemas.AuthUser?.properties as Record<string, Schema> | undefined;
  if (user?.image) user.image = nullable(user.image);
  document.tags.push({ name: 'Identidade — biblioteca' });
  return document;
}
