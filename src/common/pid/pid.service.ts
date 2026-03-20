import { Injectable } from '@nestjs/common';

// Handles Platform ID (PID) generation
// PID format: [birth year 4 digits][6 random digits][1] = 11 digits total
// Example:     1993      482916      1   →   19934829161
@Injectable()
export class PidService {
  // Generates a unique PID from a date of birth
  // The trailing "1" is a fixed identifier digit — part of your platform spec
  generate(dateOfBirth: Date): string {
    const birthYear = dateOfBirth.getFullYear().toString(); // 4 digits e.g. "1993"
    const randomPart = this.generateRandomDigits(6); // 6 random digits
    const suffix = '1'; // fixed last digit

    return `${birthYear}${randomPart}${suffix}`; // e.g. "19934829161"
  }

  // Generates a string of n random digits
  // Uses crypto-safe randomInt to avoid weak Math.random()
  private generateRandomDigits(count: number): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports
    const { randomInt } = require('crypto');
    let digits = '';
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      digits += randomInt(0, 10).toString(); // random digit 0-9
    }
    return digits;
  }
}
