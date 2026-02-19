/**
 * Firebase Functions Region Configuration
 *
 * LGPD Art. 33 — Dados de saúde devem ser processados em território brasileiro.
 * Todas as Cloud Functions devem usar southamerica-east1 (São Paulo).
 *
 * @module shared/config/region
 * @see PRD NF-DISP-003, LGPD-006
 */

/**
 * Região padrão para todas as Cloud Functions.
 * southamerica-east1 = São Paulo, Brasil.
 */
export const REGION = "southamerica-east1" as const;

/**
 * URL base de produção para as Cloud Functions.
 */
export const FUNCTIONS_BASE_URL = `https://${REGION}-medicamenta-me.cloudfunctions.net`;
