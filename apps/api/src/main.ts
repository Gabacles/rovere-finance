import { createApp } from './app.js';

const port = Number(process.env['PORT'] ?? 3100);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new RangeError('PORT must be an integer between 1 and 65535.');
}
const app = await createApp();
await app.listen(port, '0.0.0.0');
console.info(`Rovere API listening on port ${port}`);
