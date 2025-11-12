/**
 * 💊 Medications Routes
 * 
 * CRUD operations for medications
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { ApiError } from '../utils/api-error';

const router = Router();
const db = admin.firestore();

/**
 * POST /v1/medications
 * Create new medication for a patient
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const {
      patientId,
      name,
      dosage,
      frequency,
      times,
      startDate,
      endDate,
      instructions,
      prescribedBy,
      refillReminder,
      stockQuantity,
    } = req.body;

    // Validation
    if (!patientId || !name || !dosage || !frequency) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'patientId, name, dosage, and frequency are required'
      );
    }

    // Verify patient ownership
    const patientRef = db.collection('patients').doc(patientId);
    const patientDoc = await patientRef.get();

    if (!patientDoc.exists) {
      throw new ApiError(404, 'NOT_FOUND', 'Patient not found');
    }

    if (patientDoc.data()!.partnerId !== partnerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied to this patient');
    }

    // Create medication
    const medication = {
      partnerId,
      patientId,
      name,
      dosage,
      frequency, // 'daily', 'twice_daily', 'custom', etc.
      times: times || [], // Array of times: ['08:00', '20:00']
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      instructions: instructions || null,
      prescribedBy: prescribedBy || null,
      refillReminder: refillReminder || false,
      stockQuantity: stockQuantity || 0,
      status: 'active',
      adherenceRate: 0,
      totalDoses: 0,
      takenDoses: 0,
      missedDoses: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('medications').add(medication);

    res.status(201).json({
      id: docRef.id,
      ...medication,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/medications
 * List medications
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { patientId, status, limit = 50, offset = 0 } = req.query;

    let query = db.collection('medications')
      .where('partnerId', '==', partnerId);

    if (patientId) {
      query = query.where('patientId', '==', patientId);
    }

    if (status) {
      query = query.where('status', '==', status);
    }

    query = query
      .orderBy('createdAt', 'desc')
      .limit(Number(limit))
      .offset(Number(offset));

    const snapshot = await query.get();

    const medications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      data: medications,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: medications.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/medications/:id
 * Get medication by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const medicationRef = db.collection('medications').doc(id);
    const medicationDoc = await medicationRef.get();

    if (!medicationDoc.exists) {
      throw new ApiError(404, 'NOT_FOUND', 'Medication not found');
    }

    const medication = medicationDoc.data()!;

    if (medication.partnerId !== partnerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied');
    }

    res.json({
      id: medicationDoc.id,
      ...medication,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /v1/medications/:id
 * Update medication
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const medicationRef = db.collection('medications').doc(id);
    const medicationDoc = await medicationRef.get();

    if (!medicationDoc.exists) {
      throw new ApiError(404, 'NOT_FOUND', 'Medication not found');
    }

    const medication = medicationDoc.data()!;

    if (medication.partnerId !== partnerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied');
    }

    const allowedFields = [
      'name',
      'dosage',
      'frequency',
      'times',
      'startDate',
      'endDate',
      'instructions',
      'prescribedBy',
      'refillReminder',
      'stockQuantity',
      'status',
    ];

    const updates: any = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await medicationRef.update(updates);

    const updatedDoc = await medicationRef.get();

    res.json({
      id: updatedDoc.id,
      ...updatedDoc.data(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /v1/medications/:id
 * Delete medication
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const medicationRef = db.collection('medications').doc(id);
    const medicationDoc = await medicationRef.get();

    if (!medicationDoc.exists) {
      throw new ApiError(404, 'NOT_FOUND', 'Medication not found');
    }

    const medication = medicationDoc.data()!;

    if (medication.partnerId !== partnerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied');
    }

    // Soft delete
    await medicationRef.update({
      status: 'deleted',
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export const medicationsRouter = router;
