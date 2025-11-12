/**
 * Cloud Function: OCR with Google Cloud Vision API
 * 
 * Fallback for when Tesseract.js fails or returns low confidence results.
 * Triggered via HTTPS callable function.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { ImageAnnotatorClient } from '@google-cloud/vision';

// Initialize Vision API client
const visionClient = new ImageAnnotatorClient();

interface OcrRequest {
  imageData: string;  // Base64 data URL
  userId: string;
  scanId?: string;
}

interface OcrResponse {
  success: boolean;
  text?: string;
  confidence?: number;
  blocks?: TextBlock[];
  error?: string;
}

interface TextBlock {
  text: string;
  confidence: number;
  boundingBox?: BoundingBox;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * HTTPS Callable Function: Process image with Cloud Vision API
 */
export const processImageWithCloudVision = functions
  .region('us-central1')
  .runWith({
    timeoutSeconds: 60,
    memory: '512MB'
  })
  .https.onCall(async (data: OcrRequest, context): Promise<OcrResponse> => {
    // Check authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to use OCR service'
      );
    }

    const { imageData, userId, scanId } = data;

    // Validate input
    if (!imageData || !userId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: imageData and userId'
      );
    }

    // Verify user owns the request
    if (context.auth.uid !== userId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'User can only process their own images'
      );
    }

    try {
      console.log(`[Cloud Vision OCR] Processing image for user: ${userId}, scan: ${scanId}`);

      // Extract base64 data from data URL
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Call Cloud Vision API
      const [result] = await visionClient.documentTextDetection({
        image: { content: imageBuffer }
      });

      const detections = result.textAnnotations;

      if (!detections || detections.length === 0) {
        return {
          success: false,
          error: 'No text detected in image'
        };
      }

      // First annotation is the full text
      const fullTextAnnotation = detections[0];
      const fullText = fullTextAnnotation.description || '';

      // Calculate average confidence from individual words
      let totalConfidence = 0;
      let wordCount = 0;

      // Extract text blocks (skip first element which is full text)
      const blocks: TextBlock[] = [];
      for (let i = 1; i < detections.length; i++) {
        const detection = detections[i];
        
        if (detection.description && detection.boundingPoly && detection.boundingPoly.vertices) {
          const vertices = detection.boundingPoly.vertices;
          
          blocks.push({
            text: detection.description,
            confidence: 0.95, // Cloud Vision doesn't return word-level confidence
            boundingBox: vertices.length >= 4 ? {
              x: vertices[0].x || 0,
              y: vertices[0].y || 0,
              width: (vertices[2].x || 0) - (vertices[0].x || 0),
              height: (vertices[2].y || 0) - (vertices[0].y || 0)
            } : undefined
          });

          wordCount++;
          totalConfidence += 0.95;
        }
      }

      const averageConfidence = wordCount > 0 ? (totalConfidence / wordCount) * 100 : 0;

      // Save result to Firestore
      if (scanId) {
        await admin.firestore()
          .collection(`users/${userId}/ocr_scans`)
          .doc(scanId)
          .update({
            cloudVisionText: fullText,
            cloudVisionConfidence: averageConfidence,
            cloudVisionBlocks: blocks,
            cloudVisionProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
            engine: 'cloud_vision'
          });
      }

      console.log(`[Cloud Vision OCR] ✅ Success - Text length: ${fullText.length}, Confidence: ${averageConfidence.toFixed(2)}%`);

      return {
        success: true,
        text: fullText,
        confidence: averageConfidence,
        blocks
      };

    } catch (error: unknown) {
      console.error('[Cloud Vision OCR] ❌ Error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Save error to Firestore
      if (scanId) {
        await admin.firestore()
          .collection(`users/${userId}/ocr_scans`)
          .doc(scanId)
          .update({
            cloudVisionError: errorMessage,
            cloudVisionProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'error'
          });
      }

      throw new functions.https.HttpsError(
        'internal',
        `Failed to process image: ${errorMessage}`
      );
    }
  });

/**
 * Firestore Trigger: Auto-process low confidence scans with Cloud Vision
 */
export const autoProcessLowConfidenceScans = functions
  .region('us-central1')
  .firestore
  .document('users/{userId}/ocr_scans/{scanId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const { userId, scanId } = context.params;

    // Check if scan has low confidence and hasn't been processed with Cloud Vision
    const confidence = data.confidence || 0;
    const engine = data.engine || 'tesseract';
    const hasCloudVisionResult = !!data.cloudVisionText;

    if (confidence < 70 && engine === 'tesseract' && !hasCloudVisionResult) {
      console.log(`[Auto Cloud Vision] Low confidence scan detected (${confidence}%) for user: ${userId}, scan: ${scanId}`);

      try {
        // Get image data URL from document
        const imageDataUrl = data.imageDataUrl;
        
        if (!imageDataUrl) {
          console.warn('[Auto Cloud Vision] No image data URL found in scan document');
          return;
        }

        // Extract base64 data
        const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Call Cloud Vision API
        const [result] = await visionClient.documentTextDetection({
          image: { content: imageBuffer }
        });

        const detections = result.textAnnotations;

        if (!detections || detections.length === 0) {
          console.log('[Auto Cloud Vision] No text detected');
          
          await snap.ref.update({
            cloudVisionText: '',
            cloudVisionConfidence: 0,
            cloudVisionProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
            cloudVisionError: 'No text detected'
          });
          
          return;
        }

        // Extract full text
        const fullText = detections[0].description || '';
        const cloudConfidence = 95; // Cloud Vision typically has high confidence

        // Update document with Cloud Vision results
        await snap.ref.update({
          cloudVisionText: fullText,
          cloudVisionConfidence: cloudConfidence,
          cloudVisionProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
          // Only update main fields if Cloud Vision has better results
          ...(cloudConfidence > confidence && {
            confidence: cloudConfidence,
            engine: 'cloud_vision'
          })
        });

        console.log(`[Auto Cloud Vision] ✅ Processed successfully - Confidence: ${cloudConfidence}%`);

      } catch (error: unknown) {
        console.error('[Auto Cloud Vision] ❌ Error:', error);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        await snap.ref.update({
          cloudVisionError: errorMessage,
          cloudVisionProcessedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
  });
