import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import swaggerUi from 'swagger-ui-dist';
import type { AppConfig } from '../config.js';
import type { Identity } from '../identity/auth.js';
import { completeDocument } from './document.js';

export async function installApiDocs(server: express.Express, config: AppConfig, identity: Identity, controllers: readonly Function[]) {
  if (!(config.apiDocsEnabled ?? !config.production)) return;
  const document = await completeDocument(controllers, identity);
  server.use(['/api/docs', '/api/openapi.json'], async (req, res, next) => {
    if (config.production && !await identity.auth.api.getSession({ headers: fromNodeHeaders(req.headers) })) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' }); return;
    }
    // Local assets only; no validator/CDN sends specifications or financial responses away.
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });
  server.get('/api/openapi.json', (_req, res) => { res.json(document); });
  server.get(['/api/docs', '/api/docs/'], (_req, res) => {
    res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rovere Finance — Swagger</title><link rel="stylesheet" href="/api/docs/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/api/docs/swagger-ui-bundle.js"></script><script src="/api/docs/init.js"></script></body></html>`);
  });
  server.get('/api/docs/init.js', (_req, res) => {
    res.type('js').send(`window.ui = SwaggerUIBundle({url:'/api/openapi.json',dom_id:'#swagger-ui',deepLinking:true,filter:true,docExpansion:'none',defaultModelsExpandDepth:-1,validatorUrl:null,persistAuthorization:false,withCredentials:true,queryConfigEnabled:false,requestInterceptor:function(request){request.credentials='same-origin';return request;}});`);
  });
  // Explicit allowlist avoids serving upstream demo initializer, maps or arbitrary files.
  for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js']) server.get(`/api/docs/${file}`, (_req, res) => { res.sendFile(file, { root: swaggerUi.getAbsoluteFSPath() }); });
}
