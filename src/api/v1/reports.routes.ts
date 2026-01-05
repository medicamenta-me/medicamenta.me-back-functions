/**
 * 📈 Reports Routes
 */

import { Router, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { ApiError } from "../utils/api-error";

const router = Router();
const getDb = () => admin.firestore();

/**
 * GET /v1/reports/adherence
 * Generate adherence report
 */
router.get("/adherence", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { startDate, endDate, patientId } = req.query;

    let query = getDb().collection("patients")
      .where("partnerId", "==", partnerId);

    if (patientId) {
      query = query.where(admin.firestore.FieldPath.documentId(), "==", patientId);
    }

    const patientsSnapshot = await query.get();

    const report = await Promise.all(
      patientsSnapshot.docs.map(async (patientDoc) => {
        const patient = patientDoc.data();
        
        // Get medications
        const medicationsSnapshot = await getDb().collection("medications")
          .where("patientId", "==", patientDoc.id)
          .where("status", "==", "active")
          .get();

        // Get dose history
        let doseQuery = getDb().collection("dose_history")
          .where("patientId", "==", patientDoc.id);

        if (startDate) {
          doseQuery = doseQuery.where("scheduledTime", ">=", new Date(String(startDate)));
        }
        if (endDate) {
          doseQuery = doseQuery.where("scheduledTime", "<=", new Date(String(endDate)));
        }

        const doseSnapshot = await doseQuery.get();
        const doses = doseSnapshot.docs.map(d => d.data());

        const total = doses.length;
        const taken = doses.filter(d => d.status === "taken").length;
        const adherenceRate = total > 0 ? (taken / total) * 100 : 0;

        return {
          patientId: patientDoc.id,
          patientName: patient.name,
          medicationsCount: medicationsSnapshot.size,
          totalDoses: total,
          takenDoses: taken,
          missedDoses: doses.filter(d => d.status === "missed").length,
          adherenceRate: Math.round(adherenceRate * 100) / 100,
        };
      })
    );

    res.json({
      report: "adherence",
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
      generatedAt: new Date().toISOString(),
      data: report,
      summary: {
        totalPatients: report.length,
        averageAdherence: Math.round(
          (report.reduce((sum, r) => sum + r.adherenceRate, 0) / report.length) * 100
        ) / 100,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/reports/compliance
 * Generate compliance report
 */
router.get("/compliance", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;

    // Get all patients
    const patientsSnapshot = await getDb().collection("patients")
      .where("partnerId", "==", partnerId)
      .where("status", "==", "active")
      .get();

    const totalPatients = patientsSnapshot.size;

    // Get medication stats
    const medicationsSnapshot = await getDb().collection("medications")
      .where("partnerId", "==", partnerId)
      .where("status", "==", "active")
      .get();

    const totalMedications = medicationsSnapshot.size;

    // Get recent dose confirmations
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const dosesSnapshot = await getDb().collection("dose_history")
      .where("createdAt", ">=", last30Days)
      .get();

    const doses = dosesSnapshot.docs.map(d => d.data());

    res.json({
      report: "compliance",
      generatedAt: new Date().toISOString(),
      partnerId,
      metrics: {
        totalPatients,
        activePatients: totalPatients,
        totalMedications,
        last30Days: {
          totalDoses: doses.length,
          takenDoses: doses.filter(d => d.status === "taken").length,
          missedDoses: doses.filter(d => d.status === "missed").length,
          adherenceRate: doses.length > 0 
            ? Math.round((doses.filter(d => d.status === "taken").length / doses.length) * 10000) / 100
            : 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/reports/export
 * Export report in various formats
 */
router.post("/export", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reportType, format = "json" } = req.body;

    if (!reportType) {
      throw new ApiError(400, "VALIDATION_ERROR", "reportType is required");
    }

    // Generate report based on type
    let reportData;
    if (reportType === "adherence") {
      // Reuse adherence endpoint logic
      reportData = { message: "Adherence report export not yet implemented" };
    } else if (reportType === "compliance") {
      reportData = { message: "Compliance report export not yet implemented" };
    } else {
      throw new ApiError(400, "INVALID_REPORT_TYPE", `Unknown report type: ${reportType}`);
    }

    // Return based on format
    if (format === "json") {
      res.json(reportData);
    } else if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${reportType}-report.csv"`);
      res.send("CSV export not yet implemented");
    } else {
      throw new ApiError(400, "INVALID_FORMAT", `Unknown format: ${format}`);
    }
  } catch (error) {
    next(error);
  }
});

export const reportsRouter = router;
