import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createTransport } from 'nodemailer';
import type { Database } from '../database.js';
import type { AppConfig } from '../config.js';

export function createIdentity(db: Database, config: AppConfig) {
  const transport = createTransport(config.smtpUrl);
  const pending = new Set<Promise<unknown>>();
  function deliver(to: string, subject: string, url: string) {
    const task = transport.sendMail({ from: config.mailFrom, to, subject, text: `${subject}\n\n${url}\n\nSe você não solicitou esta ação, ignore esta mensagem.` })
      .catch(() => { console.error('AUTH_EMAIL_DELIVERY_FAILED'); });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  }
  const auth = betterAuth({
    appName: 'Rovere Finance',
    baseURL: config.publicOrigin,
    basePath: '/api/auth',
    secret: config.authSecret,
    trustedOrigins: [config.publicOrigin],
    database: prismaAdapter(db, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 1800,
      sendResetPassword: async ({ user, url }) => { deliver(user.email, 'Redefina sua senha — Rovere Finance', url); },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => { deliver(user.email, 'Confirme seu email — Rovere Finance', url); },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 100, customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/request-password-reset': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 5 },
    } },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      ipAddress: { ipAddressHeaders: ['x-rovere-client-ip'] },
      useSecureCookies: config.publicOrigin.startsWith('https:'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    logger: { disabled: true },
  });
  return { auth, async close() { await Promise.allSettled([...pending]); transport.close(); } };
}
export type Identity = ReturnType<typeof createIdentity>;
