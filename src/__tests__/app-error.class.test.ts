/**
 * Tests — ApplicationError class
 *
 * Cobertura: constructor, toJSON, toResponse, instanceof, edge cases.
 * @see PRD §27
 */

import { ApplicationError } from '../../shared/errors/app-error.class';
import {
  AuthErrorCode,
  MedErrorCode,
  SysErrorCode,
} from '../../shared/errors/error-codes';

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------
describe('ApplicationError — constructor', () => {
  it('should extend native Error', () => {
    const error = new ApplicationError(AuthErrorCode.EMAIL_ALREADY_REGISTERED);
    expect(error).toBeInstanceOf(Error);
  });

  it('should be an instance of ApplicationError', () => {
    const error = new ApplicationError(AuthErrorCode.EMAIL_ALREADY_REGISTERED);
    expect(error).toBeInstanceOf(ApplicationError);
  });

  it('should set name to ApplicationError', () => {
    const error = new ApplicationError(MedErrorCode.MEDICATION_NOT_FOUND);
    expect(error.name).toBe('ApplicationError');
  });

  it('should set code from the enum value', () => {
    const error = new ApplicationError(SysErrorCode.RATE_LIMIT_EXCEEDED);
    expect(error.code).toBe('SYS_003');
  });

  it('should set message from the catalog', () => {
    const error = new ApplicationError(AuthErrorCode.ACCOUNT_LOCKED);
    expect(error.message).toBe('Conta bloqueada por tentativas inválidas');
  });

  it('should set httpStatus from the catalog', () => {
    const error = new ApplicationError(AuthErrorCode.ACCOUNT_LOCKED);
    expect(error.httpStatus).toBe(423);
  });

  it('should set a valid ISO timestamp', () => {
    const before = new Date().toISOString();
    const error = new ApplicationError(SysErrorCode.INTERNAL_SERVER_ERROR);
    const after = new Date().toISOString();

    expect(error.timestamp >= before).toBe(true);
    expect(error.timestamp <= after).toBe(true);
  });

  it('should store details when provided', () => {
    const details = { field: 'password', minLength: 8 };
    const error = new ApplicationError(
      AuthErrorCode.PASSWORD_REQUIREMENTS_NOT_MET,
      details,
    );
    expect(error.details).toEqual(details);
  });

  it('should leave details undefined when not provided', () => {
    const error = new ApplicationError(AuthErrorCode.TOKEN_EXPIRED_OR_INVALID);
    expect(error.details).toBeUndefined();
  });

  it('should store requestId when provided', () => {
    const error = new ApplicationError(
      MedErrorCode.INVALID_DOSAGE,
      undefined,
      'req-001',
    );
    expect(error.requestId).toBe('req-001');
  });

  it('should leave requestId undefined when not provided', () => {
    const error = new ApplicationError(MedErrorCode.INVALID_DOSAGE);
    expect(error.requestId).toBeUndefined();
  });

  it('should accept both details and requestId', () => {
    const details = { scheduleA: '08:00', scheduleB: '08:30' };
    const error = new ApplicationError(
      MedErrorCode.SCHEDULE_CONFLICT,
      details,
      'req-002',
    );
    expect(error.details).toEqual(details);
    expect(error.requestId).toBe('req-002');
    expect(error.httpStatus).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// toJSON
// ---------------------------------------------------------------------------
describe('ApplicationError — toJSON', () => {
  it('should return a plain AppError object', () => {
    const error = new ApplicationError(
      AuthErrorCode.EMAIL_NOT_VERIFIED,
      { userId: 'u1' },
      'req-json-1',
    );
    const json = error.toJSON();

    expect(json.code).toBe('AUTH_005');
    expect(json.message).toBe('E-mail não verificado');
    expect(json.httpStatus).toBe(403);
    expect(json.details).toEqual({ userId: 'u1' });
    expect(json.requestId).toBe('req-json-1');
    expect(json.timestamp).toBeTruthy();
  });

  it('should omit details and requestId when not set', () => {
    const error = new ApplicationError(SysErrorCode.SERVICE_UNAVAILABLE);
    const json = error.toJSON();

    expect(json.code).toBe('SYS_002');
    expect(json.httpStatus).toBe(503);
    expect(json.details).toBeUndefined();
    expect(json.requestId).toBeUndefined();
  });

  it('should produce JSON-serializable output', () => {
    const error = new ApplicationError(
      MedErrorCode.DRUG_INTERACTION_DETECTED,
      { drugA: 'Warfarin', drugB: 'Aspirin' },
    );
    const serialized = JSON.stringify(error.toJSON());
    const parsed = JSON.parse(serialized);

    expect(parsed.code).toBe('MED_006');
    expect(parsed.details.drugA).toBe('Warfarin');
  });
});

// ---------------------------------------------------------------------------
// toResponse
// ---------------------------------------------------------------------------
describe('ApplicationError — toResponse', () => {
  it('should return an object with status and body', () => {
    const error = new ApplicationError(SysErrorCode.PAYLOAD_TOO_LARGE);
    const response = error.toResponse();

    expect(response.status).toBe(413);
    expect(response.body).toBeDefined();
    expect(response.body.code).toBe('SYS_004');
  });

  it('should match httpStatus in both status and body', () => {
    const error = new ApplicationError(SysErrorCode.RATE_LIMIT_EXCEEDED);
    const response = error.toResponse();

    expect(response.status).toBe(response.body.httpStatus);
  });

  it('should include details in body when provided', () => {
    const details = { retryAfter: 60 };
    const error = new ApplicationError(
      SysErrorCode.RATE_LIMIT_EXCEEDED,
      details,
      'req-resp-1',
    );
    const response = error.toResponse();

    expect(response.body.details).toEqual(details);
    expect(response.body.requestId).toBe('req-resp-1');
  });
});

// ---------------------------------------------------------------------------
// Error stack trace
// ---------------------------------------------------------------------------
describe('ApplicationError — stack trace', () => {
  it('should have a stack trace', () => {
    const error = new ApplicationError(
      AuthErrorCode.INSUFFICIENT_PERMISSIONS,
    );
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ApplicationError');
  });
});

// ---------------------------------------------------------------------------
// All error codes — construct without throwing
// ---------------------------------------------------------------------------
describe('ApplicationError — all codes', () => {
  const allCodes = [
    ...Object.values(AuthErrorCode),
    ...Object.values(MedErrorCode),
    ...Object.values(SysErrorCode),
  ];

  it.each(allCodes)(
    'should construct without throwing for code %s',
    (code) => {
      expect(() => new ApplicationError(code)).not.toThrow();
    },
  );

  it.each(allCodes)(
    'should produce valid toJSON output for code %s',
    (code) => {
      const error = new ApplicationError(code);
      const json = error.toJSON();
      expect(json.code).toBe(code);
      expect(json.message).toBeTruthy();
      expect(json.httpStatus).toBeGreaterThanOrEqual(400);
    },
  );

  it.each(allCodes)(
    'should produce valid toResponse output for code %s',
    (code) => {
      const error = new ApplicationError(code);
      const response = error.toResponse();
      expect(response.status).toBe(response.body.httpStatus);
    },
  );
});
