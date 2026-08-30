/**
 * Public-contract tests for referral redemption.
 * Focus on observable outcomes: status metadata, response body, exceptions,
 * DTO validation, AppContext, profile enrichment, and concurrency safety.
 * Avoids asserting exact Prisma call sequences so alternate correct
 * implementations (atomic updateMany, locks, raw SQL, different helpers)
 * remain acceptable.
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  RequestMethod,
  HttpStatus,
} from '@nestjs/common';
import {
  PATH_METADATA,
  METHOD_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants';
import { validate } from 'class-validator';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppType } from '../auth/dto/auth-context.dto';

describe('Referral redemption (public behavior)', () => {
  let controller: CustomersController;
  let prisma: any;
  /** In-memory customer store so points increment & concurrent writes are observable */
  let customers: Record<string, any>;

  const authed = (profileId: string) => ({ user: { profileId } });

  function postReferralHandler(): (req: any, body: any) => Promise<any> {
    const proto = Object.getPrototypeOf(controller);
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const path = Reflect.getMetadata(PATH_METADATA, proto[name]);
      const method = Reflect.getMetadata(METHOD_METADATA, proto[name]);
      if (
        method === RequestMethod.POST &&
        (path === 'profile/referral' || path === '/profile/referral')
      ) {
        return (req, body) => proto[name].call(controller, req, body);
      }
    }
    if (typeof (controller as any).redeemReferral === 'function') {
      return (req, body) => (controller as any).redeemReferral(req, body);
    }
    throw new Error('No POST profile/referral handler on CustomersController');
  }

  function findReferralHandlerMeta(): {
    path: string;
    method: number;
    httpCode?: number;
    handler: Function;
  } | null {
    const proto = Object.getPrototypeOf(controller);
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const path = Reflect.getMetadata(PATH_METADATA, proto[name]);
      const method = Reflect.getMetadata(METHOD_METADATA, proto[name]);
      if (
        method === RequestMethod.POST &&
        (path === 'profile/referral' || path === '/profile/referral')
      ) {
        const httpCode = Reflect.getMetadata(HTTP_CODE_METADATA, proto[name]);
        return { path, method, httpCode, handler: proto[name] };
      }
    }
    return null;
  }

  beforeEach(async () => {
    customers = {
      'c-new': {
        id: 'c-new',
        referralCode: 'NEWCODE',
        referredById: null,
        totalLoyaltyPoints: 0,
      },
      'c-ref': {
        id: 'c-ref',
        referralCode: 'REFCODE',
        referredById: null,
        totalLoyaltyPoints: 10,
      },
      c1: {
        id: 'c1',
        referralCode: 'MINE',
        referredById: null,
        totalLoyaltyPoints: 0,
      },
      r1: {
        id: 'r1',
        referralCode: 'AbC',
        referredById: null,
        totalLoyaltyPoints: 5,
      },
    };

    prisma = {
      customer: {
        findUnique: jest.fn(async (args: any) => {
          if (args?.where?.id) {
            return customers[args.where.id]
              ? { ...customers[args.where.id] }
              : null;
          }
          if (args?.where?.referralCode != null) {
            const code = args.where.referralCode;
            const found = Object.values(customers).find(
              (c: any) => c.referralCode === code,
            );
            return found ? { ...found } : null;
          }
          return null;
        }),
        update: jest.fn(async (args: any) => {
          const id = args.where.id;
          const row = customers[id];
          if (!row) {
            throw Object.assign(new Error('not found'), { code: 'P2025' });
          }
          const data = args.data || {};
          if (data.referredById !== undefined) {
            row.referredById = data.referredById;
          }
          if (data.totalLoyaltyPoints?.increment != null) {
            row.totalLoyaltyPoints =
              (row.totalLoyaltyPoints || 0) +
              data.totalLoyaltyPoints.increment;
          } else if (typeof data.totalLoyaltyPoints === 'number') {
            row.totalLoyaltyPoints = data.totalLoyaltyPoints;
          }
          return { ...row };
        }),
        count: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      account: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      savedLocation: {
        create: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      transaction: { findMany: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    const providers: any[] = [
      CustomersService,
      { provide: PrismaService, useValue: prisma },
    ];
    try {
      const { ReferralService } = require('./referral.service');
      providers.push(ReferralService);
    } catch {
      /* base */
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers,
    }).compile();

    controller = module.get(CustomersController);
  });

  describe('route metadata & HTTP 200', () => {
    it('exposes POST profile/referral', () => {
      const meta = findReferralHandlerMeta();
      expect(meta).toBeTruthy();
      expect(meta!.method).toBe(RequestMethod.POST);
    });

    it('returns HTTP 200 (not default 201) via @HttpCode', () => {
      const meta = findReferralHandlerMeta();
      expect(meta).toBeTruthy();
      expect(
        meta!.httpCode === 200 || meta!.httpCode === HttpStatus.OK,
      ).toBe(true);
    });

    it('is annotated with AppContext CUSTOMER', () => {
      const meta = findReferralHandlerMeta();
      expect(meta).toBeTruthy();
      const appTypes = Reflect.getMetadata('appTypes', meta!.handler);
      expect(appTypes).toBeDefined();
      expect(appTypes).toEqual(expect.arrayContaining([AppType.CUSTOMER]));
    });
  });

  describe('POST /customers/profile/referral success', () => {
    it('links referee, awards exactly 100 points to referrer, returns body', async () => {
      const beforePoints = customers['c-ref'].totalLoyaltyPoints;
      const result = await postReferralHandler()(authed('c-new'), {
        code: '  REFCODE  ',
      });
      expect(result).toEqual({
        referredById: 'c-ref',
        pointsAwarded: 100,
      });
      expect(customers['c-ref'].totalLoyaltyPoints).toBe(beforePoints + 100);
      expect(customers['c-new'].referredById).toBe('c-ref');
    });

    it('uses case-sensitive code match after trim', async () => {
      const result = await postReferralHandler()(authed('c1'), { code: 'AbC' });
      expect(result).toEqual(
        expect.objectContaining({
          referredById: 'r1',
          pointsAwarded: 100,
        }),
      );
      expect(customers.r1.totalLoyaltyPoints).toBe(105);
    });

    it('404 for case-mismatched lookup (ABC vs AbC)', async () => {
      await expect(
        postReferralHandler()(authed('c1'), { code: 'ABC' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      try {
        await postReferralHandler()(authed('c1'), { code: 'ABC' });
      } catch (e: any) {
        const body = e.getResponse?.() ?? e.response ?? e.message;
        expect(JSON.stringify(body)).toMatch(/referral_not_found/);
      }
      expect(customers.r1.totalLoyaltyPoints).toBe(5);
      expect(customers.c1.referredById).toBeNull();
    });
  });

  describe('error cases', () => {
    it('400 invalid_referral_code for empty or whitespace code', async () => {
      await expect(
        postReferralHandler()(authed('c1'), { code: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      try {
        await postReferralHandler()(authed('c1'), { code: '' });
      } catch (e: any) {
        const body = e.getResponse?.() ?? e.response ?? e.message;
        expect(JSON.stringify(body)).toMatch(/invalid_referral_code/);
      }
    });

    it('409 when already referred', async () => {
      customers.c1.referredById = 'already';
      await expect(
        postReferralHandler()(authed('c1'), { code: 'AbC' }),
      ).rejects.toBeInstanceOf(ConflictException);
      try {
        await postReferralHandler()(authed('c1'), { code: 'AbC' });
      } catch (e: any) {
        const body = e.getResponse?.() ?? e.response ?? e.message;
        expect(JSON.stringify(body)).toMatch(/referral_not_eligible/);
      }
      expect(customers.r1.totalLoyaltyPoints).toBe(5);
    });

    it('409 when redeeming own code', async () => {
      await expect(
        postReferralHandler()(authed('c1'), { code: 'MINE' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 referral_not_found for unknown code', async () => {
      try {
        await postReferralHandler()(authed('c1'), { code: 'NOPE' });
        fail('expected throw');
      } catch (e: any) {
        expect(e).toBeInstanceOf(NotFoundException);
        const body = e.getResponse?.() ?? e.response ?? e.message;
        expect(JSON.stringify(body)).toMatch(/referral_not_found/);
      }
    });

    it('second redeem by same caller returns 409 and does not award again', async () => {
      await postReferralHandler()(authed('c-new'), { code: 'REFCODE' });
      const pointsAfterFirst = customers['c-ref'].totalLoyaltyPoints;
      await expect(
        postReferralHandler()(authed('c-new'), { code: 'REFCODE' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(customers['c-ref'].totalLoyaltyPoints).toBe(pointsAfterFirst);
    });
  });

  describe('concurrent double-award prevention', () => {
    it('only one claim awards points; second returns 409', async () => {
      customers['c-a'] = {
        id: 'c-a',
        referralCode: 'CA',
        referredById: null,
        totalLoyaltyPoints: 0,
      };
      const startPoints = customers['c-ref'].totalLoyaltyPoints;

      await postReferralHandler()(authed('c-a'), { code: 'REFCODE' });
      await expect(
        postReferralHandler()(authed('c-a'), { code: 'REFCODE' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(customers['c-ref'].totalLoyaltyPoints).toBe(startPoints + 100);
      expect(customers['c-a'].referredById).toBe('c-ref');
    });

    it('re-check inside transaction rejects when referredById already set', async () => {
      let reads = 0;
      prisma.customer.findUnique.mockImplementation(async (args: any) => {
        if (args?.where?.referralCode === 'REFCODE') {
          return { ...customers['c-ref'] };
        }
        if (args?.where?.id === 'c-new') {
          reads += 1;
          if (reads > 1) {
            return {
              ...customers['c-new'],
              referredById: 'race-winner',
            };
          }
          return { ...customers['c-new'] };
        }
        return null;
      });
      await expect(
        postReferralHandler()(authed('c-new'), { code: 'REFCODE' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('RedeemReferralDto validation', () => {
    it('rejects empty code with IsString/IsNotEmpty', async () => {
      let Dto: any;
      try {
        Dto = require('./dto/redeem-referral.dto').RedeemReferralDto;
      } catch {
        fail('RedeemReferralDto is required by the public contract');
        return;
      }
      const empty = Object.assign(new Dto(), { code: '' });
      const missing = Object.assign(new Dto(), {});
      const ok = Object.assign(new Dto(), { code: 'ABC123' });
      expect((await validate(empty)).length).toBeGreaterThan(0);
      expect((await validate(missing)).length).toBeGreaterThan(0);
      expect(await validate(ok)).toEqual([]);
    });

    it('rejects non-string DTO value', async () => {
      let Dto: any;
      try {
        Dto = require('./dto/redeem-referral.dto').RedeemReferralDto;
      } catch {
        fail('RedeemReferralDto is required');
        return;
      }
      const numeric = Object.assign(new Dto(), { code: 12345 as any });
      const obj = Object.assign(new Dto(), { code: { x: 1 } as any });
      const arr = Object.assign(new Dto(), { code: ['A'] as any });
      expect((await validate(numeric)).length).toBeGreaterThan(0);
      expect((await validate(obj)).length).toBeGreaterThan(0);
      expect((await validate(arr)).length).toBeGreaterThan(0);
    });
  });

  describe('GET /customers/profile enrichment', () => {
    it('includes referralCount and totalLoyaltyPoints', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        name: 'Ada',
        totalLoyaltyPoints: 250,
        orders: [],
        transactions: [],
        _count: { referrals: 4 },
      });
      const profile = await controller.getProfile(authed('c1') as any);
      expect(profile).toHaveProperty('referralCount', 4);
      expect(profile).toHaveProperty('totalLoyaltyPoints', 250);
    });

    it('defaults referralCount to 0 when none', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        totalLoyaltyPoints: 0,
        _count: { referrals: 0 },
      });
      const profile = await controller.getProfile(authed('c1') as any);
      expect(profile).toHaveProperty('referralCount', 0);
    });

    it('defaults totalLoyaltyPoints to 0 when absent', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        _count: { referrals: 0 },
      });
      const profile = await controller.getProfile(authed('c1') as any);
      expect(profile).toHaveProperty('totalLoyaltyPoints', 0);
    });
  });
});
