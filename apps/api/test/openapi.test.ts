import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import { contractValidator } from './openapi-validator.js';
import { apiControllers } from '../dist/app.js';
import { nestDocument } from '../dist/openapi/document.js';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';

describe('RF-026 OpenAPI contracts', () => {
  it('validates versioned schema and has exactly the live Nest inventory', async () => {
    const document = JSON.parse(await readFile('docs/api/openapi.json', 'utf8'));
    await SwaggerParser.validate(structuredClone(document), { resolve: { external: false } });
    const live = nestDocument(apiControllers);
    expect(Object.keys(document.paths).filter(path => !path.startsWith('/api/auth/')).sort()).toEqual(Object.keys(live.paths).sort());
    for (const [path, methods] of Object.entries(live.paths)) expect(document.paths[path]).toEqual(methods);
    expect(Object.keys(document.components.securitySchemes)).toEqual(['sessionCookie']);
    expect(JSON.stringify(document)).not.toContain('bearerAuth');
    expect(document.paths['/api/receivables']).toBeUndefined();
    expect(document.paths['/api/auth/open-api/generate-schema']).toBeUndefined();
  });
  it('fails when an undocumented route is introduced or a documented route disappears', () => {
    class Undocumented { get() {} }
    Reflect.defineMetadata(PATH_METADATA, 'undocumented', Undocumented);
    Reflect.defineMetadata(PATH_METADATA, '/', Undocumented.prototype.get);
    Reflect.defineMetadata(METHOD_METADATA, RequestMethod.GET, Undocumented.prototype.get);
    expect(() => nestDocument([...apiControllers, Undocumented])).toThrow('OpenAPI missing operation');
    expect(() => nestDocument(apiControllers.slice(1))).toThrow('OpenAPI obsolete operation');
  });
  it('keeps exact money, knowledge, version and fictional examples valid', async () => {
    const document = JSON.parse(await readFile('docs/api/openapi.json', 'utf8'));
    const money = await contractValidator(document, { $ref: '#/components/schemas/Money' });
    expect(money({ currency: 'BRL', cents: '10000' })).toBe(true);
    for (const cents of [10000, '1.25', '1e3', '+1', '-0']) expect(money({ currency: 'BRL', cents })).toBe(false);
    const classification = await contractValidator(document, { $ref: '#/components/schemas/Classification' });
    expect(classification({ state: 'unknown' })).toBe(true);
    expect(classification({ state: 'unknown', value: { currency: 'BRL', cents: '0' } })).toBe(false);
    for (const methods of Object.values(document.paths) as any[]) for (const op of Object.values(methods) as any[]) for (const content of Object.values(op.requestBody?.content ?? {}) as any[]) {
      if (content.example) {
        const validate = await contractValidator(document, content.schema);
        expect(validate(content.example), JSON.stringify(validate.errors)).toBe(true);
      }
    }
  });
});
