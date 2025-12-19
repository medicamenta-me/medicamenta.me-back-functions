/**
 * Testes para processImageWithCloudVision Cloud Function
 * 
 * Cenários testados:
 * - Processamento de imagem com texto detectado
 * - Validações de autenticação e permissões
 * - Edge cases: sem texto, baixa confiança, erros da API
 */

// @ts-nocheck
import * as admin from 'firebase-admin';
import functionsTest from 'firebase-functions-test';
import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const test = functionsTest();

// Mock Cloud Vision API
const mockDocumentTextDetection = jest.fn() as jest.Mock;

jest.mock('@google-cloud/vision', () => {
  return {
    ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
      documentTextDetection: mockDocumentTextDetection,
    })),
  };
});

import { processImageWithCloudVision } from '../../ocr-cloud-vision';

describe('📸 OCR Functions - processImageWithCloudVision', () => {
  let wrapped: any;
  const testUserId = 'test-user-ocr-123';
  const testScanId = 'scan-123';
  
  // Sample base64 image (1x1 transparent PNG)
  const sampleImageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  
  beforeAll(() => {
    // Firebase Admin j� inicializado no setup.ts global
    
    wrapped = test.wrap(processImageWithCloudVision);
  });

  afterAll(() => {
    test.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('✅ Cenários Positivos', () => {
    it('deve processar imagem e extrair texto com sucesso', async () => {
      // Arrange
      const mockDetections = [
        {
          description: 'RECEITA MÉDICA\nDipirona 500mg\nTomar 1 comprimido a cada 6 horas',
          boundingPoly: {
            vertices: [
              { x: 10, y: 10 },
              { x: 200, y: 10 },
              { x: 200, y: 100 },
              { x: 10, y: 100 },
            ],
          },
        },
        {
          description: 'RECEITA',
          boundingPoly: {
            vertices: [{ x: 10, y: 10 }, { x: 80, y: 10 }, { x: 80, y: 30 }, { x: 10, y: 30 }],
          },
        },
        {
          description: 'MÉDICA',
          boundingPoly: {
            vertices: [{ x: 85, y: 10 }, { x: 150, y: 10 }, { x: 150, y: 30 }, { x: 85, y: 30 }],
          },
        },
      ];

      mockDocumentTextDetection.mockResolvedValue([
        {
          textAnnotations: mockDetections,
        },
      ]);

      const data = {
        imageData: sampleImageData,
        userId: testUserId,
        // scanId omitted to avoid Firestore emulator dependency
      };

      const context = {
        auth: {
          uid: testUserId,
          token: {
            email: 'test@example.com',
          },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.text).toBeDefined();
      expect(result.text).toContain('RECEITA MÉDICA');
      expect(result.text).toContain('Dipirona 500mg');
      expect(result.confidence).toBeGreaterThan(0);
      expect(mockDocumentTextDetection).toHaveBeenCalledTimes(1);
    });

    it('deve retornar blocks individuais de texto', async () => {
      // Arrange
      const mockDetections = [
        {
          description: 'Paracetamol 750mg',
          boundingPoly: {
            vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }, { x: 0, y: 20 }],
          },
        },
        {
          description: 'Paracetamol',
          boundingPoly: {
            vertices: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 20 }, { x: 0, y: 20 }],
          },
        },
      ];

      mockDocumentTextDetection.mockResolvedValue([
        {
          textAnnotations: mockDetections,
        },
      ]);

      const data = {
        imageData: sampleImageData,
        userId: testUserId,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result.success).toBe(true);
      expect(result.blocks).toBeDefined();
      expect(result.blocks?.length).toBeGreaterThan(0);
      expect(result.blocks?.[0].text).toBeDefined();
      expect(result.blocks?.[0].boundingBox).toBeDefined();
    });

    it('deve processar imagem sem scanId opcional', async () => {
      // Arrange
      mockDocumentTextDetection.mockResolvedValue([
        {
          textAnnotations: [
            {
              description: 'Test text',
              boundingPoly: {
                vertices: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 20 }, { x: 0, y: 20 }],
              },
            },
          ],
        },
      ]);

      const data = {
        imageData: sampleImageData,
        userId: testUserId,
        // scanId omitted
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('❌ Cenários Negativos', () => {
    it('deve retornar erro se não autenticado', async () => {
      const data = {
        imageData: sampleImageData,
        userId: testUserId,
      };

      const context = { auth: undefined };

      await expect(wrapped(data, context)).rejects.toThrow(
        'User must be authenticated'
      );
    });

    it('deve retornar erro se imageData ausente', async () => {
      const data = {
        userId: testUserId,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      await expect(wrapped(data, context)).rejects.toThrow(
        'Missing required fields'
      );
    });

    it('deve retornar erro se userId ausente', async () => {
      const data = {
        imageData: sampleImageData,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      await expect(wrapped(data, context)).rejects.toThrow(
        'Missing required fields'
      );
    });

    it('deve retornar erro se usuário tentar processar imagem de outro usuário', async () => {
      const data = {
        imageData: sampleImageData,
        userId: 'other-user-456',
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      await expect(wrapped(data, context)).rejects.toThrow(
        'User can only process their own images'
      );
    });

    it('deve retornar success:false se nenhum texto detectado', async () => {
      // Arrange
      mockDocumentTextDetection.mockResolvedValue([
        {
          textAnnotations: [], // Empty array - no text detected
        },
      ]);

      const data = {
        imageData: sampleImageData,
        userId: testUserId,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('No text detected');
    });
  });

  describe('⚠️ Edge Cases', () => {
    it('deve lidar com falha na API Cloud Vision', async () => {
      // Arrange
      mockDocumentTextDetection.mockRejectedValue(
        new Error('Cloud Vision API Error: Quota exceeded')
      );

      const data = {
        imageData: sampleImageData,
        userId: testUserId,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act & Assert
      await expect(wrapped(data, context)).rejects.toThrow();
    });

    it('deve lidar com imagem base64 inválida', async () => {
      // Arrange
      const invalidImageData = 'data:image/png;base64,INVALID_BASE64';

      const data = {
        imageData: invalidImageData,
        userId: testUserId,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act & Assert
      // Should handle gracefully or throw error
      await expect(wrapped(data, context)).rejects.toThrow();
    });

    it('deve lidar com imagem muito grande', async () => {
      // Arrange
      const largeImageData = 'data:image/png;base64,' + 'A'.repeat(10 * 1024 * 1024); // 10MB

      const data = {
        imageData: largeImageData,
        userId: testUserId,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act & Assert
      await expect(wrapped(data, context)).rejects.toThrow();
    });

    it('deve lidar com detections sem boundingPoly', async () => {
      // Arrange
      mockDocumentTextDetection.mockResolvedValue([
        {
          textAnnotations: [
            {
              description: 'Text without bounding box',
              // boundingPoly missing
            },
          ],
        },
      ]);

      const data = {
        imageData: sampleImageData,
        userId: testUserId,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result.success).toBe(true);
      // Should handle gracefully even without bounding boxes
    });
  });
});
