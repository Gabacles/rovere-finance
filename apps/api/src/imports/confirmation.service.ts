import { Inject, Injectable } from '@nestjs/common';
import { addCents, compatibleFinancialValues, confirmationValue, effectiveCandidate, parseCents } from '@rovere/domain';
import type { FinancialValue, ImportCandidate, KnownValue, RowCorrections } from '@rovere/domain';
import { DATABASE } from '../accounts/accounts.controller.js';
import type { Database } from '../database.js';
import { fail, json, key, object, version } from './validation.js';
import { findRecord, fingerprint, identityRecord, originNamespace, similarRecords } from './financial-records.js';
import type { Tx, Stored } from './financial-records.js';

interface Prepared { rowId: string; sourceRecordId: string; ordinal: number; action: 'created' | 'linked' | 'skipped'; value?: FinancialValue; namespace?: string; externalId?: string | null; recordId?: string; priorRowId?: string; decision: unknown }
export interface Blocker { rowId: string; ordinal: number; code: string }
export interface Total { kind: string; accountId: string; statementId: string | null; selectedCents: string; newCents: string }
@Injectable()
export class ConfirmationService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  private async plan(tx: Tx, userId: string, batchId: string) {
    const batch = await tx.importBatch.findUnique({ where: { id_userId: { id: batchId, userId } }, include: { blocks: { include: { statement: true } } } });
    if (!batch) fail(404, 'IMPORT_NOT_FOUND', 'Importação não encontrada.');
    if (batch.status !== 'review') fail(409, 'IMPORT_NOT_IN_REVIEW', 'A importação não está em revisão.');
    const rows = await tx.importRow.findMany({ where: { batchId, userId }, include: { source: true }, orderBy: { source: { ordinal: 'asc' } } });
    const prepared: Prepared[] = []; const blockers: Blocker[] = []; const totals = new Map<string, Total>();
    const pendingIdentities = new Map<string, Prepared>();
    const identities = new Map<string, Stored | null>(); const similar = new Map<string, Stored[]>();
    for (const row of rows) {
      const decision = { action: row.action, reason: row.reason, linkBankEntryId: row.linkBankEntryId, linkCardChargeId: row.linkCardChargeId,
        distinctBankEntryId: row.distinctBankEntryId, distinctCardChargeId: row.distinctCardChargeId, reviewVersion: batch.version };
      if (!row.selected) { prepared.push({ rowId: row.id, sourceRecordId: row.sourceRecordId, ordinal: row.source.ordinal, action: 'skipped', decision }); continue; }
      const block = batch.blocks.find(value => value.id === row.source.blockId)!;
      try {
        const candidate = effectiveCandidate(row.candidate as unknown as ImportCandidate, row.corrections as unknown as RowCorrections, row.source.period as unknown as KnownValue<string>, block);
        const value = confirmationValue(candidate, block); const namespace = originNamespace(batch.format, batch.configuration, block.metadata);
        const externalId = candidate.externalId.state === 'confirmed' ? candidate.externalId.value : null;
        if (externalId && externalId.length > 256) throw new Error('EXTERNAL_ID_TOO_LONG');
        const identityKey = JSON.stringify([value.kind, value.accountId, namespace, externalId]);
        if (externalId && !identities.has(identityKey)) identities.set(identityKey, await identityRecord(tx, userId, value, namespace, externalId));
        const existing = externalId ? identities.get(identityKey) ?? null : null;
        const prior = externalId ? pendingIdentities.get(identityKey) : undefined;
        const distinctId = row.distinctBankEntryId ?? row.distinctCardChargeId;
        const linkId = row.linkBankEntryId ?? row.linkCardChargeId;
        let recordId: string | undefined; let priorRowId: string | undefined;
        if (existing && !compatibleFinancialValues(value, existing) || prior?.value && !compatibleFinancialValues(value, prior.value)) throw new Error('EXTERNAL_IDENTITY_CONFLICT');
        if ((existing || prior) && distinctId) throw new Error('EXTERNAL_IDENTITY_CONFLICT');
        if (row.action === 'link') {
          if (!linkId) throw new Error('LINK_REQUIRED');
          const target = await findRecord(tx, userId, value.kind, linkId);
          if (!target || !compatibleFinancialValues(value, target)) throw new Error('LINK_INCOMPATIBLE');
          if (existing && existing.id !== target.id || prior && prior.recordId !== target.id) throw new Error('EXTERNAL_IDENTITY_CONFLICT');
          recordId = target.id;
        } else if (row.action !== 'create') throw new Error('INVALID_DECISION');
        else if (existing) recordId = existing.id;
        else if (prior) { if (prior.recordId) recordId = prior.recordId; else priorRowId = prior.rowId; }
        else {
          const fp = fingerprint(value); if (!similar.has(fp)) similar.set(fp, await similarRecords(tx, userId, value));
          const matches = similar.get(fp)!;
          if (distinctId) {
            const distinct = await findRecord(tx, userId, value.kind, distinctId);
            if (!distinct || distinct.fingerprint !== fp) throw new Error('DISTINCT_MATCH_CHANGED');
          } else if (matches.length) throw new Error('MATCH_REVIEW_REQUIRED');
        }
        const action = recordId || priorRowId ? 'linked' : 'created';
        const item: Prepared = { rowId: row.id, sourceRecordId: row.sourceRecordId, ordinal: row.source.ordinal, action, value, namespace, externalId, decision,
          ...(recordId ? { recordId } : {}), ...(priorRowId ? { priorRowId } : {}) };
        const totalKey = JSON.stringify([value.kind, value.accountId, value.statementId]);
        const total = totals.get(totalKey) ?? { kind: value.kind, accountId: value.accountId, statementId: value.statementId, selectedCents: '0', newCents: '0' };
        try {
          const selectedCents = addCents(parseCents(total.selectedCents), parseCents(value.cents)).toString();
          const newCents = action === 'created' ? addCents(parseCents(total.newCents), parseCents(value.cents)).toString() : total.newCents;
          total.selectedCents = selectedCents; total.newCents = newCents;
        } catch { throw new Error('SUMMARY_TOTAL_OVERFLOW'); }
        totals.set(totalKey, total); prepared.push(item);
        if (externalId && !pendingIdentities.has(identityKey)) pendingIdentities.set(identityKey, item);
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error) throw error;
        const code = error instanceof Error && /^[A-Z_]{1,100}$/.test(error.message) ? error.message : 'INVALID_FINANCIAL_VALUE';
        blockers.push({ rowId: row.id, ordinal: row.source.ordinal, code });
      }
    }
    return { version: batch.version, prepared, blockers, totals: [...totals.values()] };
  }
  async preview(userId: string, batchId: string) {
    return this.db.$transaction(async tx => {
      const plan = await this.plan(tx, userId, batchId);
      return { version: plan.version, created: plan.prepared.filter(row => row.action === 'created').length, linked: plan.prepared.filter(row => row.action === 'linked').length,
        skipped: plan.prepared.filter(row => row.action === 'skipped').length, blockerCount: plan.blockers.length, blockers: plan.blockers.slice(0, 20), totals: plan.totals };
    }, { isolationLevel: 'RepeatableRead', timeout: 60000 });
  }
  async confirm(userId: string, batchId: string, body: unknown, header: unknown) {
    const expectedVersion = version(object(body, ['expectedVersion']).expectedVersion); const token = key(header);
    return this.db.$transaction(async tx => {
      // Serialize confirmations of different batches for the same owner as well as same-key retries.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const replay = await tx.importConfirmation.findUnique({ where: { userId_key: { userId, key: token } } });
      if (replay) {
        if (replay.batchId !== batchId || replay.reviewVersion !== expectedVersion) fail(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outro comando.');
        return replay.result;
      }
      const batch = await tx.importBatch.findUnique({ where: { id_userId: { id: batchId, userId } } });
      if (!batch) fail(404, 'IMPORT_NOT_FOUND', 'Importação não encontrada.');
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ImportBatch"
        WHERE "id" = ${batchId} AND "userId" = ${userId} AND "status" = 'review' AND "version" = ${expectedVersion} FOR UPDATE`;
      if (!locked.length) fail(409, 'CONFIRMATION_CONFLICT', 'A revisão mudou ou já foi confirmada. Recarregue antes de continuar.');
      const plan = await this.plan(tx, userId, batchId);
      if (plan.blockers.length) fail(409, 'CONFIRMATION_BLOCKED', 'Revise as linhas pendentes antes de confirmar.', plan.blockers.slice(0, 20));
      const ids = new Map<string, string>(); const outcomes: { rowId: string; action: string; kind?: string; recordId?: string }[] = [];
      for (const item of plan.prepared) {
        if (item.action === 'skipped') {
          await tx.importOutcome.create({ data: { sourceRecordId: item.sourceRecordId, batchId, userId, action: 'skipped', decision: json(item.decision) } });
          outcomes.push({ rowId: item.rowId, action: 'skipped' }); continue;
        }
        const value = item.value!; let recordId = item.recordId ?? (item.priorRowId ? ids.get(item.priorRowId) : undefined);
        if (item.action === 'created') {
          const common = { userId, postedOn: new Date(`${value.postedOn}T00:00:00.000Z`), description: value.description, cents: parseCents(value.cents), fingerprint: fingerprint(value) };
          const record = value.kind === 'bank' ? await tx.bankEntry.create({ data: { ...common, accountId: value.accountId } }) :
            await tx.cardCharge.create({ data: { ...common, creditAccountId: value.accountId, statementId: value.statementId!, cardId: value.cardId, installment: json(value.installment) } });
          recordId = record.id;
        }
        if (!recordId) throw new Error('MISSING_CONFIRMATION_TARGET'); ids.set(item.rowId, recordId);
        if (item.externalId) {
          if (value.kind === 'bank') {
            const identity = await tx.bankExternalIdentity.upsert({ where: { userId_accountId_namespace_externalId: { userId, accountId: value.accountId, namespace: item.namespace!, externalId: item.externalId } },
            create: { userId, accountId: value.accountId, namespace: item.namespace!, externalId: item.externalId, entryId: recordId }, update: {} });
            if (identity.entryId !== recordId) fail(409, 'EXTERNAL_IDENTITY_CONFLICT', 'Identidade externa conflitante.');
          } else {
            const identity = await tx.cardExternalIdentity.upsert({ where: { userId_creditAccountId_namespace_externalId: { userId, creditAccountId: value.accountId, namespace: item.namespace!, externalId: item.externalId } },
            create: { userId, creditAccountId: value.accountId, namespace: item.namespace!, externalId: item.externalId, chargeId: recordId }, update: {} });
            if (identity.chargeId !== recordId) fail(409, 'EXTERNAL_IDENTITY_CONFLICT', 'Identidade externa conflitante.');
          }
        }
        await tx.importOutcome.create({ data: { sourceRecordId: item.sourceRecordId, batchId, userId, action: item.action,
          ...(value.kind === 'bank' ? { entryId: recordId } : { chargeId: recordId }), decision: json({ decision: item.decision, confirmedValue: value }) } });
        outcomes.push({ rowId: item.rowId, action: item.action, kind: value.kind, recordId });
      }
      const result = { batchId, reviewVersion: expectedVersion, created: outcomes.filter(row => row.action === 'created').length,
        linked: outcomes.filter(row => row.action === 'linked').length, skipped: outcomes.filter(row => row.action === 'skipped').length, totals: plan.totals, rows: outcomes };
      await tx.importConfirmation.create({ data: { userId, batchId, key: token, reviewVersion: expectedVersion, result: json(result) } });
      await tx.importBatch.update({ where: { id: batchId }, data: { status: 'confirmed', version: expectedVersion + 1 } });
      return result;
    }, { timeout: 60000, maxWait: 60000 });
  }
}
