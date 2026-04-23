/**
 * Registration DTO validation tests.
 * These cover the mutual-exclusion contract between Rwanda NID registration
 * and Foreign Identity Number registration.
 */
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterDto } from './register.dto';

const VALID_PASSWORD = 'Secure@2024!';
const VALID_EMAIL = 'test@example.com';

function buildDto(overrides: Partial<RegisterDto> = {}): RegisterDto {
  return plainToInstance(RegisterDto, {
    email: VALID_EMAIL,
    password: VALID_PASSWORD,
    ...overrides,
  });
}

function validationMessages(dto: RegisterDto): string[] {
  return validateSync(dto)
    .flatMap((error) => Object.values(error.constraints ?? {}))
    .filter((message): message is string => typeof message === 'string');
}

describe('RegisterDto', () => {
  it('accepts a Rwanda NID without a FIN', () => {
    const dto = buildDto({ documentNumber: '1199880012345678' });

    expect(validationMessages(dto)).toEqual([]);
  });

  it('accepts a FIN without a Rwanda NID', () => {
    const dto = buildDto({ fin: '2199170000047067' });

    expect(validationMessages(dto)).toEqual([]);
  });

  it('rejects when both documentNumber and fin are provided', () => {
    const dto = buildDto({
      documentNumber: '1199880012345678',
      fin: '2199170000047067',
    });

    expect(validationMessages(dto)).toContain(
      'Provide either documentNumber or fin, not both in the same request.',
    );
  });

  it('rejects when neither documentNumber nor fin is provided', () => {
    const dto = buildDto();

    expect(validationMessages(dto)).toContain(
      'Either documentNumber or fin must be provided for registration.',
    );
  });

  it('rejects FIN values that do not match the expected format', () => {
    const dto = buildDto({ fin: '1199170000047067' });

    expect(validationMessages(dto)).toContain(
      'Foreign Identity Number must be 16 digits and start with 2.',
    );
  });
});
