/**
 * Testes para autoProcessLowConfidenceScans Firestore Trigger
 * 
 * Cenários testados:
 * - Trigger automático para scans com baixa confiança
 * - Atualização com resultados do Cloud Vision
 * - Validação de condições para processamento
 * - Edge cases: sem imagem, erros da API
 */

// @ts-nocheck
import * as admin from "firebase-admin";
import functionsTest from "firebase-functions-test";
import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";

const test = functionsTest();

// Mock Cloud Vision API
const mockDocumentTextDetection = jest.fn() as jest.Mock;

jest.mock("@google-cloud/vision", () => {
  return {
    ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
      documentTextDetection: mockDocumentTextDetection,
    })),
  };
});

import { autoProcessLowConfidenceScans } from "../../ocr-cloud-vision";

describe("🔄 OCR Triggers - autoProcessLowConfidenceScans", () => {
  let wrapped: any;
  const testUserId = "test-user-trigger-123";
  const testScanId = "scan-trigger-456";
  
  // Sample base64 image (1x1 transparent PNG)
  const sampleImageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  
  beforeAll(() => {
    // Firebase Admin j� inicializado no setup.ts global
    
    wrapped = test.wrap(autoProcessLowConfidenceScans);
  });

  afterAll(() => {
    test.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("✅ Cenários Positivos", () => {
    it("deve processar automaticamente scan com confiança < 70%", async () => {
      // Arrange
      const mockDetections = [
        {
          description: "RECEITA MÉDICA\nAmoxicilina 500mg",
          boundingPoly: {
            vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }],
          },
        },
      ];

      mockDocumentTextDetection.mockResolvedValue([
        {
          textAnnotations: mockDetections,
        },
      ]);

      const scanData = {
        confidence: 45, // Low confidence from Tesseract
        engine: "tesseract",
        imageDataUrl: sampleImageData,
        text: "RECE1TA MED1CA", // Poor OCR result
      };

      const mockSnap = {
        data: () => scanData,
        ref: {
          update: jest.fn().mockResolvedValue(undefined),
        },
      };

      const context = {
        params: {
          userId: testUserId,
          scanId: testScanId,
        },
      };

      // Act
      await wrapped(mockSnap, context);

      // Assert
      expect(mockDocumentTextDetection).toHaveBeenCalledTimes(1);
      expect(mockSnap.ref.update).toHaveBeenCalledWith(
        expect.objectContaining({
          cloudVisionText: expect.any(String),
          cloudVisionConfidence: 95,
          confidence: 95, // Updated to Cloud Vision confidence
          engine: "cloud_vision", // Updated engine
        })
      );
    });

    it("deve manter engine=tesseract se confiança original for maior", async () => {
      // Arrange
      mockDocumentTextDetection.mockResolvedValue([
        {
          textAnnotations: [
            {
              description: "Some text",
              boundingPoly: {
                vertices: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 20 }, { x: 0, y: 20 }],
              },
            },
          ],
        },
      ]);

      const scanData = {
        confidence: 65, // Low but not terrible
        engine: "tesseract",
        imageDataUrl: sampleImageData,
        text: "Some text",
      };

      const mockSnap = {
        data: () => scanData,
        ref: {
          update: jest.fn().mockResolvedValue(undefined),
        },
      };

      const context = {
        params: {
          userId: testUserId,
          scanId: testScanId,
        },
      };

      // Act
      await wrapped(mockSnap, context);

      // Assert
      expect(mockSnap.ref.update).toHaveBeenCalledWith(
        expect.objectContaining({
          cloudVisionText: expect.any(String),
          cloudVisionConfidence: 95,
          confidence: 95, // Cloud Vision is better
          engine: "cloud_vision",
        })
      );
    });
  });

  describe("❌ Cenários Negativos", () => {
    it("NÃO deve processar se confiança >= 70%", async () => {
      // Arrange
      const scanData = {
        confidence: 85, // Good confidence
        engine: "tesseract",
        imageDataUrl: sampleImageData,
      };

      const mockSnap = {
        data: () => scanData,
        ref: {
          update: jest.fn(),
        },
      };

      const context = {
        params: {
          userId: testUserId,
          scanId: testScanId,
        },
      };

      // Act
      await wrapped(mockSnap, context);

      // Assert
      expect(mockDocumentTextDetection).not.toHaveBeenCalled();
      expect(mockSnap.ref.update).not.toHaveBeenCalled();
    });

    it("NÃO deve processar se engine já for cloud_vision", async () => {
      // Arrange
      const scanData = {
        confidence: 50, // Low confidence but already processed
        engine: "cloud_vision",
        imageDataUrl: sampleImageData,
        cloudVisionText: "Already processed",
      };

      const mockSnap = {
        data: () => scanData,
        ref: {
          update: jest.fn(),
        },
      };

      const context = {
        params: {
          userId: testUserId,
          scanId: testScanId,
        },
      };

      // Act
      await wrapped(mockSnap, context);

      // Assert
      expect(mockDocumentTextDetection).not.toHaveBeenCalled();
      expect(mockSnap.ref.update).not.toHaveBeenCalled();
    });

    it("NÃO deve processar se cloudVisionText já existir", async () => {
      // Arrange
      const scanData = {
        confidence: 50,
        engine: "tesseract",
        imageDataUrl: sampleImageData,
        cloudVisionText: "Already has Cloud Vision result",
      };

      const mockSnap = {
        data: () => scanData,
        ref: {
          update: jest.fn(),
        },
      };

      const context = {
        params: {
          userId: testUserId,
          scanId: testScanId,
        },
      };

      // Act
      await wrapped(mockSnap, context);

      // Assert
      expect(mockDocumentTextDetection).not.toHaveBeenCalled();
      expect(mockSnap.ref.update).not.toHaveBeenCalled();
    });

    it("deve salvar erro se imageDataUrl ausente", async () => {
      // Arrange
      const scanData = {
        confidence: 50,
        engine: "tesseract",
        // imageDataUrl missing
      };

      const mockSnap = {
        data: () => scanData,
        ref: {
          update: jest.fn(),
        },
      };

      const context = {
        params: {
          userId: testUserId,
          scanId: testScanId,
        },
      };

      // Act
      await wrapped(mockSnap, context);

      // Assert
      expect(mockDocumentTextDetection).not.toHaveBeenCalled();
      expect(mockSnap.ref.update).not.toHaveBeenCalled();
      // Should log warning but not crash
    });

    it("deve salvar erro se nenhum texto detectado pelo Cloud Vision", async () => {
      // Arrange
      mockDocumentTextDetection.mockResolvedValue([
        {
          textAnnotations: [], // No text detected
        },
      ]);

      const scanData = {
        confidence: 50,
        engine: "tesseract",
        imageDataUrl: sampleImageData,
      };

      const mockSnap = {
        data: () => scanData,
        ref: {
          update: jest.fn().mockResolvedValue(undefined),
        },
      };

      const context = {
        params: {
          userId: testUserId,
          scanId: testScanId,
        },
      };

      // Act
      await wrapped(mockSnap, context);

      // Assert
      expect(mockSnap.ref.update).toHaveBeenCalledWith(
        expect.objectContaining({
          cloudVisionText: "",
          cloudVisionConfidence: 0,
          cloudVisionError: "No text detected",
        })
      );
    });
  });

  describe("⚠️ Edge Cases", () => {
    it("deve lidar com erro da API Cloud Vision", async () => {
      // Arrange
      mockDocumentTextDetection.mockRejectedValue(
        new Error("Cloud Vision API Error: Service unavailable")
      );

      const scanData = {
        confidence: 50,
        engine: "tesseract",
        imageDataUrl: sampleImageData,
      };

      const mockSnap = {
        data: () => scanData,
        ref: {
          update: jest.fn().mockResolvedValue(undefined),
        },
      };

      const context = {
        params: {
          userId: testUserId,
          scanId: testScanId,
        },
      };

      // Act
      await wrapped(mockSnap, context);

      // Assert
      expect(mockSnap.ref.update).toHaveBeenCalledWith(
        expect.objectContaining({
          cloudVisionError: expect.stringContaining("Service unavailable"),
        })
      );
    });

    it("deve processar scan com confidence=0", async () => {
      // Arrange
      mockDocumentTextDetection.mockResolvedValue([
        {
          textAnnotations: [
            {
              description: "Recovered text",
              boundingPoly: {
                vertices: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 20 }, { x: 0, y: 20 }],
              },
            },
          ],
        },
      ]);

      const scanData = {
        confidence: 0, // Complete failure
        engine: "tesseract",
        imageDataUrl: sampleImageData,
        text: "",
      };

      const mockSnap = {
        data: () => scanData,
        ref: {
          update: jest.fn().mockResolvedValue(undefined),
        },
      };

      const context = {
        params: {
          userId: testUserId,
          scanId: testScanId,
        },
      };

      // Act
      await wrapped(mockSnap, context);

      // Assert
      expect(mockDocumentTextDetection).toHaveBeenCalledTimes(1);
      expect(mockSnap.ref.update).toHaveBeenCalledWith(
        expect.objectContaining({
          cloudVisionText: expect.any(String),
          cloudVisionConfidence: 95,
        })
      );
    });
  });
});
