import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from '../src/app.controller';

describe('AppController boundary (e2e)', () => {
  let controller: AppController;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = moduleFixture.get(AppController);
  });

  it('returns the health payload', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });
});
