import { parentPort, workerData } from 'node:worker_threads';
import { ImportFileError, parseCsv, parseOfx } from '@rovere/importers';
import type { CsvProfile, Encoding } from '@rovere/importers';

try {
  const { bytes, id, format, configuration } = workerData as { bytes: Uint8Array; id: string; format: string; configuration: { profile: CsvProfile; encoding?: Encoding } };
  const parsed = format === 'csv' ? parseCsv(bytes, id, configuration.profile) : parseOfx(bytes, id, configuration.encoding);
  parentPort!.postMessage({ parsed });
} catch (error) { parentPort!.postMessage({ error: error instanceof ImportFileError ? error.code : 'PARSER_FAILED' }); }
