/**
 * Tests — Error Codes, Error Catalog, Factory Functions
 *
 * Cobertura: enums, tipos, catálogo, factory functions, classificadores.
 * @see PRD §27
 */

import {
  AuthErrorCode,
  MedErrorCode,
  SysErrorCode,
  ErrorCode,
} from '../../shared/errors/error-codes';

import {
  getErrorCatalogEntry,
  createAppError,
  getHttpStatus,
  getUserMessage,
  isAuthError,
  isMedError,
  isSysError,
  getAllErrorCodes,
} from '../../shared/errors/error-catalog';

// ---------------------------------------------------------------------------
// §27.1 — AuthErrorCode enum values
// ---------------------------------------------------------------------------
describe('AuthErrorCode', () => {
  it('should map EMAIL_ALREADY_REGISTERED to AUTH_001', () => {
    expect(AuthErrorCode.EMAIL_ALREADY_REGISTERED).toBe('AUTH_001');
  });

  it('should map PASSWORD_REQUIREMENTS_NOT_MET to AUTH_002', () => {
    expect(AuthErrorCode.PASSWORD_REQUIREMENTS_NOT_MET).toBe('AUTH_002');
  });

  it('should map TOKEN_EXPIRED_OR_INVALID to AUTH_003', () => {
    expect(AuthErrorCode.TOKEN_EXPIRED_OR_INVALID).toBe('AUTH_003');
  });

  it('should map ACCOUNT_LOCKED to AUTH_004', () => {
    expect(AuthErrorCode.ACCOUNT_LOCKED).toBe('AUTH_004');
  });

  it('should map EMAIL_NOT_VERIFIED to AUTH_005', () => {
    expect(AuthErrorCode.EMAIL_NOT_VERIFIED).toBe('AUTH_005');
  });

  it('should map SESSION_EXPIRED to AUTH_006', () => {
    expect(AuthErrorCode.SESSION_EXPIRED).toBe('AUTH_006');
  });

  it('should map INSUFFICIENT_PERMISSIONS to AUTH_007', () => {
    expect(AuthErrorCode.INSUFFICIENT_PERMISSIONS).toBe('AUTH_007');
  });

  it('should have exactly 7 members', () => {
    expect(Object.values(AuthErrorCode)).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// §27.2 — MedErrorCode enum values
// ---------------------------------------------------------------------------
describe('MedErrorCode', () => {
  it('should map MEDICATION_NOT_FOUND to MED_001', () => {
    expect(MedErrorCode.MEDICATION_NOT_FOUND).toBe('MED_001');
  });

  it('should map MEDICATION_NAME_REQUIRED to MED_002', () => {
    expect(MedErrorCode.MEDICATION_NAME_REQUIRED).toBe('MED_002');
  });

  it('should map INVALID_DOSAGE to MED_003', () => {
    expect(MedErrorCode.INVALID_DOSAGE).toBe('MED_003');
  });

  it('should map INVALID_FREQUENCY to MED_004', () => {
    expect(MedErrorCode.INVALID_FREQUENCY).toBe('MED_004');
  });

  it('should map SCHEDULE_CONFLICT to MED_005', () => {
    expect(MedErrorCode.SCHEDULE_CONFLICT).toBe('MED_005');
  });

  it('should map DRUG_INTERACTION_DETECTED to MED_006', () => {
    expect(MedErrorCode.DRUG_INTERACTION_DETECTED).toBe('MED_006');
  });

  it('should have exactly 6 members', () => {
    expect(Object.values(MedErrorCode)).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// §27.8 — SysErrorCode enum values
// ---------------------------------------------------------------------------
describe('SysErrorCode', () => {
  it('should map INTERNAL_SERVER_ERROR to SYS_001', () => {
    expect(SysErrorCode.INTERNAL_SERVER_ERROR).toBe('SYS_001');
  });

  it('should map SERVICE_UNAVAILABLE to SYS_002', () => {
    expect(SysErrorCode.SERVICE_UNAVAILABLE).toBe('SYS_002');
  });

  it('should map RATE_LIMIT_EXCEEDED to SYS_003', () => {
    expect(SysErrorCode.RATE_LIMIT_EXCEEDED).toBe('SYS_003');
  });

  it('should map PAYLOAD_TOO_LARGE to SYS_004', () => {
    expect(SysErrorCode.PAYLOAD_TOO_LARGE).toBe('SYS_004');
  });

  it('should map API_VERSION_NOT_SUPPORTED to SYS_005', () => {
    expect(SysErrorCode.API_VERSION_NOT_SUPPORTED).toBe('SYS_005');
  });

  it('should have exactly 5 members', () => {
    expect(Object.values(SysErrorCode)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// getAllErrorCodes
// ---------------------------------------------------------------------------
describe('getAllErrorCodes', () => {
  it('should return all 18 error codes', () => {
    const codes = getAllErrorCodes();
    expect(codes).toHaveLength(18);
  });

  it('should include all AUTH codes', () => {
    const codes = getAllErrorCodes();
    Object.values(AuthErrorCode).forEach((code) => {
      expect(codes).toContain(code);
    });
  });

  it('should include all MED codes', () => {
    const codes = getAllErrorCodes();
    Object.values(MedErrorCode).forEach((code) => {
      expect(codes).toContain(code);
    });
  });

  it('should include all SYS codes', () => {
    const codes = getAllErrorCodes();
    Object.values(SysErrorCode).forEach((code) => {
      expect(codes).toContain(code);
    });
  });
});

// ---------------------------------------------------------------------------
// getErrorCatalogEntry
// ---------------------------------------------------------------------------
describe('getErrorCatalogEntry', () => {
  const allCodes = [
    ...Object.values(AuthErrorCode),
    ...Object.values(MedErrorCode),
    ...Object.values(SysErrorCode),
  ] as ErrorCode[];

  it.each(allCodes)(
    'should return a valid entry for code %s',
    (code) => {
      const entry = getErrorCatalogEntry(code);
      expect(entry.code).toBe(code);
      expect(entry.message).toBeTruthy();
      expect(entry.httpStatus).toBeGreaterThanOrEqual(400);
      expect(entry.httpStatus).toBeLessThan(600);
      expect(entry.description).toBeTruthy();
      expect(entry.userMessage).toBeTruthy();
    },
  );

  it('should throw for an unknown error code', () => {
    expect(() =>
      getErrorCatalogEntry('UNKNOWN_999' as ErrorCode),
    ).toThrow('Error code "UNKNOWN_999" not found in catalog');
  });
});

// ---------------------------------------------------------------------------
// getHttpStatus
// ---------------------------------------------------------------------------
describe('getHttpStatus', () => {
  it('should return 409 for AUTH_001', () => {
    expect(getHttpStatus(AuthErrorCode.EMAIL_ALREADY_REGISTERED)).toBe(409);
  });

  it('should return 400 for AUTH_002', () => {
    expect(getHttpStatus(AuthErrorCode.PASSWORD_REQUIREMENTS_NOT_MET)).toBe(400);
  });

  it('should return 401 for AUTH_003', () => {
    expect(getHttpStatus(AuthErrorCode.TOKEN_EXPIRED_OR_INVALID)).toBe(401);
  });

  it('should return 423 for AUTH_004', () => {
    expect(getHttpStatus(AuthErrorCode.ACCOUNT_LOCKED)).toBe(423);
  });

  it('should return 403 for AUTH_005', () => {
    expect(getHttpStatus(AuthErrorCode.EMAIL_NOT_VERIFIED)).toBe(403);
  });

  it('should return 401 for AUTH_006', () => {
    expect(getHttpStatus(AuthErrorCode.SESSION_EXPIRED)).toBe(401);
  });

  it('should return 403 for AUTH_007', () => {
    expect(getHttpStatus(AuthErrorCode.INSUFFICIENT_PERMISSIONS)).toBe(403);
  });

  it('should return 404 for MED_001', () => {
    expect(getHttpStatus(MedErrorCode.MEDICATION_NOT_FOUND)).toBe(404);
  });

  it('should return 400 for MED_002', () => {
    expect(getHttpStatus(MedErrorCode.MEDICATION_NAME_REQUIRED)).toBe(400);
  });

  it('should return 400 for MED_003', () => {
    expect(getHttpStatus(MedErrorCode.INVALID_DOSAGE)).toBe(400);
  });

  it('should return 400 for MED_004', () => {
    expect(getHttpStatus(MedErrorCode.INVALID_FREQUENCY)).toBe(400);
  });

  it('should return 409 for MED_005', () => {
    expect(getHttpStatus(MedErrorCode.SCHEDULE_CONFLICT)).toBe(409);
  });

  it('should return 409 for MED_006', () => {
    expect(getHttpStatus(MedErrorCode.DRUG_INTERACTION_DETECTED)).toBe(409);
  });

  it('should return 500 for SYS_001', () => {
    expect(getHttpStatus(SysErrorCode.INTERNAL_SERVER_ERROR)).toBe(500);
  });

  it('should return 503 for SYS_002', () => {
    expect(getHttpStatus(SysErrorCode.SERVICE_UNAVAILABLE)).toBe(503);
  });

  it('should return 429 for SYS_003', () => {
    expect(getHttpStatus(SysErrorCode.RATE_LIMIT_EXCEEDED)).toBe(429);
  });

  it('should return 413 for SYS_004', () => {
    expect(getHttpStatus(SysErrorCode.PAYLOAD_TOO_LARGE)).toBe(413);
  });

  it('should return 400 for SYS_005', () => {
    expect(getHttpStatus(SysErrorCode.API_VERSION_NOT_SUPPORTED)).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// getUserMessage
// ---------------------------------------------------------------------------
describe('getUserMessage', () => {
  const allCodes = getAllErrorCodes();

  it.each(allCodes)(
    'should return a non-empty user message for code %s',
    (code) => {
      const message = getUserMessage(code);
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    },
  );
});

// ---------------------------------------------------------------------------
// isAuthError / isMedError / isSysError
// ---------------------------------------------------------------------------
describe('isAuthError', () => {
  it('should return true for all AUTH codes', () => {
    Object.values(AuthErrorCode).forEach((code) => {
      expect(isAuthError(code)).toBe(true);
    });
  });

  it('should return false for MED codes', () => {
    Object.values(MedErrorCode).forEach((code) => {
      expect(isAuthError(code)).toBe(false);
    });
  });

  it('should return false for SYS codes', () => {
    Object.values(SysErrorCode).forEach((code) => {
      expect(isAuthError(code)).toBe(false);
    });
  });
});

describe('isMedError', () => {
  it('should return true for all MED codes', () => {
    Object.values(MedErrorCode).forEach((code) => {
      expect(isMedError(code)).toBe(true);
    });
  });

  it('should return false for AUTH codes', () => {
    Object.values(AuthErrorCode).forEach((code) => {
      expect(isMedError(code)).toBe(false);
    });
  });

  it('should return false for SYS codes', () => {
    Object.values(SysErrorCode).forEach((code) => {
      expect(isMedError(code)).toBe(false);
    });
  });
});

describe('isSysError', () => {
  it('should return true for all SYS codes', () => {
    Object.values(SysErrorCode).forEach((code) => {
      expect(isSysError(code)).toBe(true);
    });
  });

  it('should return false for AUTH codes', () => {
    Object.values(AuthErrorCode).forEach((code) => {
      expect(isSysError(code)).toBe(false);
    });
  });

  it('should return false for MED codes', () => {
    Object.values(MedErrorCode).forEach((code) => {
      expect(isSysError(code)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// createAppError
// ---------------------------------------------------------------------------
describe('createAppError', () => {
  it('should create an AppError with correct code and message', () => {
    const error = createAppError(AuthErrorCode.EMAIL_ALREADY_REGISTERED);
    expect(error.code).toBe('AUTH_001');
    expect(error.message).toBe('E-mail já cadastrado');
    expect(error.httpStatus).toBe(409);
  });

  it('should include a valid ISO timestamp', () => {
    const before = new Date().toISOString();
    const error = createAppError(SysErrorCode.INTERNAL_SERVER_ERROR);
    const after = new Date().toISOString();

    expect(error.timestamp).toBeTruthy();
    expect(error.timestamp >= before).toBe(true);
    expect(error.timestamp <= after).toBe(true);
  });

  it('should include details when provided', () => {
    const details = { field: 'email', value: 'test@test.com' };
    const error = createAppError(
      AuthErrorCode.EMAIL_ALREADY_REGISTERED,
      details,
    );
    expect(error.details).toEqual(details);
  });

  it('should have undefined details when not provided', () => {
    const error = createAppError(AuthErrorCode.EMAIL_ALREADY_REGISTERED);
    expect(error.details).toBeUndefined();
  });

  it('should include requestId when provided', () => {
    const error = createAppError(
      MedErrorCode.MEDICATION_NOT_FOUND,
      undefined,
      'req-abc-123',
    );
    expect(error.requestId).toBe('req-abc-123');
  });

  it('should have undefined requestId when not provided', () => {
    const error = createAppError(MedErrorCode.MEDICATION_NOT_FOUND);
    expect(error.requestId).toBeUndefined();
  });

  it('should include both details and requestId when provided', () => {
    const details = { dosage: 500 };
    const error = createAppError(
      MedErrorCode.INVALID_DOSAGE,
      details,
      'req-xyz-789',
    );
    expect(error.details).toEqual(details);
    expect(error.requestId).toBe('req-xyz-789');
    expect(error.code).toBe('MED_003');
    expect(error.httpStatus).toBe(400);
  });
});
