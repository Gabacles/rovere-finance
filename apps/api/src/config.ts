export interface AppConfig {
  databaseUrl: string;
  authSecret: string;
  publicOrigin: string;
  smtpUrl: string;
  mailFrom: string;
  production: boolean;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const required = (key: string) => {
    const value = env[key];
    if (!value) throw new Error(`Missing configuration: ${key}`);
    return value;
  };
  const publicOrigin = new URL(required('APP_ORIGIN'));
  const databaseUrl = required('DATABASE_URL');
  if (!['postgres:', 'postgresql:'].includes(new URL(databaseUrl).protocol)) throw new Error('Invalid database protocol.');
  if (!['http:', 'https:'].includes(publicOrigin.protocol) || publicOrigin.pathname !== '/' || publicOrigin.search || publicOrigin.hash || publicOrigin.username || publicOrigin.password) {
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without path or credentials.');
  }
  const authSecret = required('BETTER_AUTH_SECRET');
  const production = env['NODE_ENV'] === 'production';
  if (authSecret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.');
  if (production && (publicOrigin.protocol !== 'https:' || authSecret.includes('development'))) {
    throw new Error('Production requires HTTPS and a non-development auth secret.');
  }
  const smtpUrl = required('SMTP_URL');
  if (!['smtp:', 'smtps:'].includes(new URL(smtpUrl).protocol)) throw new Error('Invalid SMTP protocol.');
  return { databaseUrl, authSecret, publicOrigin: publicOrigin.origin, smtpUrl, mailFrom: required('MAIL_FROM'), production };
}
