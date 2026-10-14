import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ClassificationError, normalizeCardClassification } from '@rovere/domain';
import { DATABASE } from '../accounts/accounts.controller.js';
import type { Database } from '../database.js';
import { fail, json, key, object, version } from '../imports/validation.js';
import { chargeDetails } from './card-classification.js';

@Injectable()
export class CardChargesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async get(userId: string, id: string) {
    const row = await this.db.cardCharge.findUnique({ where: { id_userId: { id, userId } }, include: { manualAdjustment: { include: { reversal: true } }, reversalOf: true } });
    if (!row) fail(404, 'CHARGE_NOT_FOUND', 'Cobrança não encontrada.'); return { ...chargeDetails(row), ...(row.manualAdjustment ? { manualAdjustment: { reason: row.manualAdjustment.reason, evidence: row.manualAdjustment.evidence, reversalChargeId: row.manualAdjustment.reversal?.reversalChargeId ?? null }, reversalOfChargeId: row.reversalOf?.originalChargeId ?? null } : {}) };
  }
  async history(userId: string, id: string) {
    await this.get(userId, id); return this.db.cardChargeCommand.findMany({ where: { chargeId: id, userId }, select: { id: true, version: true, changes: true, createdAt: true }, orderBy: { version: 'desc' }, take: 20 });
  }
  update(userId: string, id: string, body: unknown, token: unknown) {
    const data = object(body, ['expectedVersion', 'classification']); const expectedVersion = version(data.expectedVersion); const commandKey = key(token);
    if (expectedVersion >= 2147483647) fail(400, 'INVALID_VERSION', 'Versão inválida.');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const row = await tx.cardCharge.findUnique({ where: { id_userId: { id, userId } } }); if (!row) fail(404, 'CHARGE_NOT_FOUND', 'Cobrança não encontrada.');
      let value: ReturnType<typeof normalizeCardClassification>;
      try { value = normalizeCardClassification(data.classification, row.cents.toString()); }
      catch (error) { fail(400, 'INVALID_CLASSIFICATION', 'Confirme natureza e magnitude do valor original em BRL.', [{ field: error instanceof ClassificationError ? error.field : 'classification', code: 'INVALID_CLASSIFICATION' }]); }
      const request = { id, expectedVersion, classification: value }; const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      const replay = await tx.cardChargeCommand.findUnique({ where: { userId_key: { userId, key: commandKey } } });
      if (replay) { if (replay.requestHash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outros dados.'); return replay.result; }
      if (row.version !== expectedVersion) fail(409, 'CHARGE_VERSION_CONFLICT', 'A cobrança mudou. Recarregue os dados antes de salvar.');
      if (await tx.manualCardAdjustment.findUnique({ where: { chargeId: id } })) fail(409, 'MANUAL_ADJUSTMENT_IMMUTABLE', 'Ajuste informado é imutável. Use uma reversão explícita.');
      if (await tx.expenseRefund.findUnique({ where: { chargeId: id } }) && (!value || value.nature !== 'refund')) fail(409, 'REFUND_DEPENDENCY', 'Desassocie o estorno da compra antes de mudar sua natureza.');
      if (value && value.nature !== 'purchase' && await tx.installmentMatch.findUnique({ where: { chargeId: id } })) fail(409, 'CLASSIFICATION_DEPENDENCY', 'Desconcilie a parcela antes de atribuir outra natureza à cobrança.');
      const decisionId = randomUUID(); const previous = chargeDetails(row);
      const changed = await tx.cardCharge.updateMany({ where: { id, userId, version: expectedVersion }, data: { version: { increment: 1 }, classificationKind: value?.nature ?? null,
        classifiedCents: value ? BigInt(value.amount.cents) : null, classificationEvidence: json(value ? { kind: 'user', decisionId } : {}) } });
      if (changed.count !== 1) fail(409, 'CHARGE_VERSION_CONFLICT', 'A cobrança mudou. Recarregue os dados antes de salvar.');
      const result = chargeDetails(await tx.cardCharge.findUniqueOrThrow({ where: { id_userId: { id, userId } } }));
      await tx.cardChargeCommand.create({ data: { id: decisionId, userId, creditAccountId: row.creditAccountId, chargeId: id, key: commandKey, requestHash: hash, version: result.version, changes: json({ request, previous, current: result }), result: json(result) } });
      return result;
    });
  }
}
