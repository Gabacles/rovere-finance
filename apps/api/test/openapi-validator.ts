import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export function contractValidator(document: any, schema: any) {
  const ajv = new Ajv2020({ strict: false, allErrors: true }); addFormats(ajv);
  return ajv.compile({ components: document.components, ...schema });
}
