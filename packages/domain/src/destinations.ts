import type { StatementPeriod } from './statement-period.js';

export type CardKind = 'physical' | 'virtual' | 'additional';
export interface CreditAccountDTO { id: string; name: string; currency: 'BRL' }
export interface CardDTO { id: string; creditAccountId: string; name: string; kind: CardKind }
// Only the explicitly confirmed period is known at this stage.
export interface StatementDTO { id: string; creditAccountId: string; period: StatementPeriod; periodOrigin: 'manual' }
