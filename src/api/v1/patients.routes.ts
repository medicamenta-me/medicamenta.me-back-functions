/**
 * 👤 Patients Routes
 * 
 * CRUD operations for patients
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { ApiError } from '../utils/api-error';

const router = Router();
const getDb = () => admin.firestore();

/**
 * POST /v1/patients
 * Create new patient
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const {
      name,
      email,
      phone,
      dateOfBirth,
      gender,
      address,
      emergencyContact,
      medicalConditions,
      allergies,
      metadata,
    } = req.body;

    // Validation
    if (!name || !dateOfBirth) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'name and dateOfBirth are required',
        { required: ['name', 'dateOfBirth'] }
      );
    }

    // Create patient
    const patient = {
      partnerId,
      name,
      email: email || null,
      phone: phone || null,
      dateOfBirth: new Date(dateOfBirth),
      gender: gender || null,
      address: address || null,
      emergencyContact: emergencyContact || null,
      medicalConditions: medicalConditions || [],
      allergies: allergies || [],
      metadata: metadata || {},
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await getDb().collection('patients').add(patient);

    // Log creation
    await getDb().collection('audit_logs').add({
      action: 'PATIENT_CREATED',
      partnerId,
      patientId: docRef.id,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json({
      id: docRef.id,
      ...patient,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) { next(error); }
});

/**
 * GET /v1/patients/:id
 * Get patient by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const patientRef = getDb().collection('patients').doc(id);
    const patientDoc = await patientRef.get();

    if (!patientDoc.exists) {
      throw new ApiError(404, 'NOT_FOUND', 'Patient not found');
    }

    const patient = patientDoc.data()!;

    // Verify ownership
    if (patient.partnerId !== partnerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied to this patient');
    }

    res.json({
      id: patientDoc.id,
      ...patient,
    });
  } catch (error) { next(error); }
});

/**
 * GET /v1/patients
 * List patients
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { limit = 20, offset = 0, status, search } = req.query;

    let query = getDb().collection('patients')
      .where('partnerId', '==', partnerId);

    // Filter by status
    if (status) {
      query = query.where('status', '==', status);
    }

    // Pagination
    query = query
      .limit(Number(limit))
      .offset(Number(offset));

    const snapshot = await query.get();

    const patients = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Client-side search if needed (Firestore doesn't support full-text search)
    let filteredPatients = patients;
    if (search) {
      const searchLower = String(search).toLowerCase();
      filteredPatients = patients.filter((p: any) =>
        p.name?.toLowerCase().includes(searchLower) ||
        p.email?.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      data: filteredPatients,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: filteredPatients.length,
      },
    });
  } catch (error) { next(error); }
});

/**
 * PATCH /v1/patients/:id
 * Update patient
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const patientRef = getDb().collection('patients').doc(id);
    const patientDoc = await patientRef.get();

    if (!patientDoc.exists) {
      throw new ApiError(404, 'NOT_FOUND', 'Patient not found');
    }

    const patient = patientDoc.data()!;

    // Verify ownership
    if (patient.partnerId !== partnerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied to this patient');
    }

    // Update allowed fields
    const allowedFields = [
      'name',
      'email',
      'phone',
      'dateOfBirth',
      'gender',
      'address',
      'emergencyContact',
      'medicalConditions',
      'allergies',
      'metadata',
      'status',
    ];

    const updates: any = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'No valid fields to update');
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await patientRef.update(updates);

    // Log update
    await getDb().collection('audit_logs').add({
      action: 'PATIENT_UPDATED',
      partnerId,
      patientId: id,
      changes: updates,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updatedDoc = await patientRef.get();

    res.json({
      id: updatedDoc.id,
      ...updatedDoc.data(),
    });
  } catch (error) { next(error); }
});

/**
 * DELETE /v1/patients/:id
 * Delete patient (soft delete)
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;
    const { hard = false } = req.query;

    const patientRef = getDb().collection('patients').doc(id);
    const patientDoc = await patientRef.get();

    if (!patientDoc.exists) {
      throw new ApiError(404, 'NOT_FOUND', 'Patient not found');
    }

    const patient = patientDoc.data()!;

    // Verify ownership
    if (patient.partnerId !== partnerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied to this patient');
    }

    if (hard === 'true') {
      // Hard delete (permanent)
      await patientRef.delete();
    } else {
      // Soft delete
      await patientRef.update({
        status: 'deleted',
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Log deletion
    await getDb().collection('audit_logs').add({
      action: hard === 'true' ? 'PATIENT_HARD_DELETED' : 'PATIENT_DELETED',
      partnerId,
      patientId: id,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(204).send();
  } catch (error) { next(error); }
});

export const patientsRouter = router;

