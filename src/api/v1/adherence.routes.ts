/**
 * 📊 Adherence Routes
 * 
 * Endpoints for medication adherence tracking
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { ApiError } from '../utils/api-error';

const router = Router();
const getDb = () => admin.firestore();

/**
 * GET /v1/adherence/:patientId
 * Get adherence rate for a patient
 */
router.get('/:patientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { patientId } = req.params;
    const { startDate, endDate, medicationId } = req.query;

    // Verify patient ownership
    const patientRef = getDb().collection('patients').doc(patientId);
    const patientDoc = await patientRef.get();

    if (!patientDoc.exists) {
      throw new ApiError(404, 'NOT_FOUND', 'Patient not found');
    }

    if (patientDoc.data()!.partnerId !== partnerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied');
    }

    // Query dose history
    let query = getDb().collection('dose_history')
      .where('patientId', '==', patientId);

    if (medicationId) {
      query = query.where('medicationId', '==', medicationId);
    }

    if (startDate) {
      query = query.where('scheduledTime', '>=', new Date(String(startDate)));
    }

    if (endDate) {
      query = query.where('scheduledTime', '<=', new Date(String(endDate)));
    }

    const snapshot = await query.get();

    const doses = snapshot.docs.map(doc => doc.data());

    // Calculate adherence metrics
    const total = doses.length;
    const taken = doses.filter(d => d.status === 'taken').length;
    const missed = doses.filter(d => d.status === 'missed').length;
    const skipped = doses.filter(d => d.status === 'skipped').length;
    const pending = doses.filter(d => d.status === 'pending').length;

    const adherenceRate = total > 0 ? (taken / total) * 100 : 0;

    res.json({
      patientId,
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
      metrics: {
        totalDoses: total,
        takenDoses: taken,
        missedDoses: missed,
        skippedDoses: skipped,
        pendingDoses: pending,
        adherenceRate: Math.round(adherenceRate * 100) / 100,
      },
      byMedication: medicationId ? null : await getAdherenceByMedication(patientId, partnerId),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/adherence/:patientId/history
 * Get dose history for a patient
 */
router.get('/:patientId/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { patientId } = req.params;
    const { limit = 100, offset = 0, status, medicationId } = req.query;

    // Verify patient ownership
    const patientRef = getDb().collection('patients').doc(patientId);
    const patientDoc = await patientRef.get();

    if (!patientDoc.exists) {
      throw new ApiError(404, 'NOT_FOUND', 'Patient not found');
    }

    if (patientDoc.data()!.partnerId !== partnerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied');
    }

    let query = getDb().collection('dose_history')
      .where('patientId', '==', patientId);

    if (status) {
      query = query.where('status', '==', status);
    }

    if (medicationId) {
      query = query.where('medicationId', '==', medicationId);
    }

    query = query
      .orderBy('scheduledTime', 'desc')
      .limit(Number(limit))
      .offset(Number(offset));

    const snapshot = await query.get();

    const history = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      data: history,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: history.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/adherence/confirm
 * Confirm dose taken
 */
router.post('/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { patientId, medicationId, scheduledTime, takenAt, notes } = req.body;

    if (!patientId || !medicationId || !scheduledTime) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'patientId, medicationId, and scheduledTime are required'
      );
    }

    // Verify patient ownership
    const patientRef = getDb().collection('patients').doc(patientId);
    const patientDoc = await patientRef.get();

    if (!patientDoc.exists) {
      throw new ApiError(404, 'NOT_FOUND', 'Patient not found');
    }

    if (patientDoc.data()!.partnerId !== partnerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied');
    }

    // Verify medication ownership
    const medicationRef = getDb().collection('medications').doc(medicationId);
    const medicationDoc = await medicationRef.get();

    if (!medicationDoc.exists) {
      throw new ApiError(404, 'NOT_FOUND', 'Medication not found');
    }

    if (medicationDoc.data()!.partnerId !== partnerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied');
    }

    // Record dose
    const doseRecord = {
      patientId,
      medicationId,
      medicationName: medicationDoc.data()!.name,
      dosage: medicationDoc.data()!.dosage,
      scheduledTime: new Date(scheduledTime),
      takenAt: takenAt ? new Date(takenAt) : admin.firestore.FieldValue.serverTimestamp(),
      status: 'taken',
      notes: notes || null,
      source: 'api',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await getDb().collection('dose_history').add(doseRecord);

    // Update medication stats
    await medicationRef.update({
      totalDoses: admin.firestore.FieldValue.increment(1),
      takenDoses: admin.firestore.FieldValue.increment(1),
      adherenceRate: admin.firestore.FieldValue.increment(0), // Recalculate in batch job
    });

    res.status(201).json({
      id: docRef.id,
      ...doseRecord,
      takenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper: Get adherence by medication
 */
async function getAdherenceByMedication(
  patientId: string,
  partnerId: string
): Promise<any[]> {
  const medicationsSnapshot = await getDb().collection('medications')
    .where('patientId', '==', patientId)
    .where('partnerId', '==', partnerId)
    .where('status', '==', 'active')
    .get();

  const results = await Promise.all(
    medicationsSnapshot.docs.map(async (medicationDoc) => {
      const medication = medicationDoc.data();
      
      const doseSnapshot = await getDb().collection('dose_history')
        .where('medicationId', '==', medicationDoc.id)
        .get();

      const doses = doseSnapshot.docs.map(d => d.data());
      const total = doses.length;
      const taken = doses.filter(d => d.status === 'taken').length;
      const adherenceRate = total > 0 ? (taken / total) * 100 : 0;

      return {
        medicationId: medicationDoc.id,
        medicationName: medication.name,
        dosage: medication.dosage,
        totalDoses: total,
        takenDoses: taken,
        adherenceRate: Math.round(adherenceRate * 100) / 100,
      };
    })
  );

  return results;
}

export const adherenceRouter = router;
