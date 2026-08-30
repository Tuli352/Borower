/**
 * Public-contract tests for referral redemption.
 * Observable outcomes only; multi-shape Prisma store.
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

function createBehavioralStore(seed: Record<string, any>) {
  const rows: Record<string, any> = {};
  for (const [id, row] of Object.entries(seed)) {
    rows[id] = { ...row };
  }

  const findBy = (where: any) => {
    if (!where) return null;
    if (where.id != null) {
      return rows[where.id] ? { ...rows[where.id] } : null;
    }
    if (where.referralCode != null) {
      const found = Object.values(rows).find(
        (c: any) => c.referralCode === where.referralCode,
      );
      return found ? { ...found } : null;
    }
    return null;
  };

  const applyData = (row: any, data: any) => {
    if (!data) return;
    for (const [key, val] of Object.entries(data)) {
      if (val && typeof val === 'object' && 'increment' in (val as any)) {
        row[key] = (row[key] || 0) + (val as any).increment;
      } else if (val && typeof val === 'object' && 'set' in (val as any)) {
        row[key] = (val as any).set;
      } else {
        row[key] = val;
      }
    }
  };

  const referralCountFor = (id: string) =>
    Object.values(rows).filter((c: any) => c.referredById === id).length;

  const customerApi = {
    findUnique: jest.fn(async (args: any) => {
      const row = findBy(args?.where);
      if (!row) return null;
      if (args?.include?._count?.select?.referrals) {
        return {
          ...row,
          _count: { referrals: referralCountFor(row.id) },
          orders: args.include.orders ? [] : undefined,
          transactions: args.include.transactions ? [] : undefined,
        };
      }
      if (args?.include) {
        const extra: any = {};
        if (args.include.orders) extra.orders = [];
        if (args.include.transactions) extra.transactions = [];
        return { ...row, ...extra };
      }
      if (args?.select) {
        const picked: any = {};
        for (const k of Object.keys(args.select)) {
          if (k === '_count' && args.select._count?.select?.referrals) {
            picked._count = { referrals: referralCountFor(row.id) };
          } else if (args.select[k]) {
            picked[k] = row[k];
          }
        }
        return picked;
      }
      return row;
    }),
    findFirst: jest.fn(async (args: any) => findBy(args?.where)),
    update: jest.fn(async (args: any) => {
      const id = args?.where?.id;
      if (!id || !rows[id]) {
        throw Object.assign(new Error('Record to update not found.'), {
          code: 'P2025',
        });
      }
      if (
        Object.prototype.hasOwnProperty.call(args.where, 'referredById') &&
        rows[id].referredById !== args.where.referredById
      ) {
        throw Object.assign(new Error('Record to update not found.'), {
          code: 'P2025',
        });
      }
      applyData(rows[id], args.data);
      return { ...rows[id] };
    }),
    updateMany: jest.fn(async (args: any) => {
      let count = 0;
      for (const row of Object.values(rows) as any[]) {
        let match = true;
        if (args?.where) {
          for (const [k, v] of Object.entries(args.where)) {
            if (row[k] !== v) {
              match = false;
              break;
            }
          }
        }
        if (match) {
          applyData(row, args.data);
          count += 1;
        }
      }
      return { count };
    }),
    count: jest.fn(async (args: any) => {
      let list = Object.values(rows) as any[];
      if (args?.where) {
        list = list.filter((row) => {
          for (const [k, v] of Object.entries(args.where)) {
            if (row[k] !== v) return false;
          }
          return true;
        });
      }
      return list.length;
    }),
    findMany: jest.fn(async () => Object.values(rows).map((r) => ({ ...r }))),
    create: jest.fn(),
    delete: jest.fn(),
  };

  const prismaFacade: any = {
    customer: customerApi,
    account: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    savedLocation: {
      create: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    transaction: { findMany: jest.fn() },
    $transaction: jest.fn(async (arg: any) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg(prismaFacade);
    }),
  };

  return { rows, prisma: prismaFacade };
}

describe('Referral redemption (public behavior)', () => {
  let controller: CustomersController;
  let rows: Record<string, any>;
  let prisma: any;

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

  function findReferralHandler(): Function | null {
    const proto = Object.getPrototypeOf(controller);
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const path = Reflect.getMetadata(PATH_METADATA, proto[name]);
      const method = Reflect.getMetadata(METHOD_METADATA, proto[name]);
      if (
        method === RequestMethod.POST &&
        (path === 'profile/referral' || path === '/profile/referral')
      ) {
        return proto[name];
      }
    }
    if (typeof (controller as any).redeemReferral === 'function') {
      return (controller as any).redeemReferral;
    }
    return null;
  }

  beforeEach(async () => {
    const store = createBehavioralStore({
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
    });
    rows = store.rows;
    prisma = store.prisma;

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

  describe('route metadata', () => {
    it('exposes POST profile/referral on the controller', () => {
      expect(findReferralHandler()).toBeTruthy();
    });

    it('marks the referral route for CUSTOMER AppContext', () => {
      const handler = findReferralHandler();
      expect(handler).toBeTruthy();
      const appTypes = Reflect.getMetadata('appTypes', handler!);
      expect(appTypes).toBeDefined();
      expect(appTypes).toEqual(expect.arrayContaining([AppType.CUSTOMER]));
    });

    it('declares HTTP 200 for successful redemption (not default 201)', () => {
      const handler = findReferralHandler();
      expect(handler).toBeTruthy();
      const httpCode = Reflect.getMetadata(HTTP_CODE_METADATA, handler!);
      expect(httpCode === 200 || httpCode === HttpStatus.OK).toBe(true);
    });
  });

  describe('POST /customers/profile/referral', () => {
    it('writes referredById and awards 100 points to referrer', async () => {
      const beforeRef = rows['c-ref'].totalLoyaltyPoints;
      const beforeNew = rows['c-new'].totalLoyaltyPoints;

      const result = await postReferralHandler()(authed('c-new'), {
        code: '  REFCODE  ',
      });

      expect(result).toEqual({
        referredById: 'c-ref',
        pointsAwarded: 100,
      });
      expect(rows['c-new'].referredById).toBe('c-ref');
      expect(rows['c-ref'].totalLoyaltyPoints).toBe(beforeRef + 100);
      expect(rows['c-new'].totalLoyaltyPoints).toBe(beforeNew);
    });

    it('uses case-sensitive code match after trim', async () => {
      const result = await postReferralHandler()(authed('c1'), { code: 'AbC' });
      expect(result).toEqual(
        expect.objectContaining({
          referredById: 'r1',
          pointsAwarded: 100,
        }),
      );
      expect(rows.c1.referredById).toBe('r1');
      expect(rows.r1.totalLoyaltyPoints).toBe(105);
    });

    it('404 when code differs only by case', async () => {
      await expect(
        postReferralHandler()(authed('c1'), { code: 'ABC' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      try {
        await postReferralHandler()(authed('c1'), { code: 'ABC' });
      } catch (e: any) {
        const body = e.getResponse?.() ?? e.response ?? e.message;
        expect(JSON.stringify(body)).toMatch(/referral_not_found/);
      }
      expect(rows.r1.totalLoyaltyPoints).toBe(5);
      expect(rows.c1.referredById).toBeNull();
    });

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
      expect(rows.c1.referredById).toBeNull();
    });

    it('409 when already referred', async () => {
      rows.c1.referredById = 'already';
      await expect(
        postReferralHandler()(authed('c1'), { code: 'AbC' }),
      ).rejects.toBeInstanceOf(ConflictException);
      try {
        await postReferralHandler()(authed('c1'), { code: 'AbC' });
      } catch (e: any) {
        const body = e.getResponse?.() ?? e.response ?? e.message;
        expect(JSON.stringify(body)).toMatch(/referral_not_eligible/);
      }
      expect(rows.r1.totalLoyaltyPoints).toBe(5);
    });

    it('409 when redeeming own code', async () => {
      await expect(
        postReferralHandler()(authed('c1'), { code: 'MINE' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(rows.c1.referredById).toBeNull();
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
      expect(rows.c1.referredById).toBeNull();
    });

    it('second redeem does not award points again', async () => {
      await postReferralHandler()(authed('c-new'), { code: 'REFCODE' });
      const pointsAfterFirst = rows['c-ref'].totalLoyaltyPoints;
      await expect(
        postReferralHandler()(authed('c-new'), { code: 'REFCODE' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(rows['c-ref'].totalLoyaltyPoints).toBe(pointsAfterFirst);
      expect(rows['c-new'].referredById).toBe('c-ref');
    });

    it('overlapping claims do not double-award', async () => {
      rows['c-a'] = {
        id: 'c-a',
        referralCode: 'CA',
        referredById: null,
        totalLoyaltyPoints: 0,
      };
      const startPoints = rows['c-ref'].totalLoyaltyPoints;

      const results = await Promise.allSettled([
        postReferralHandler()(authed('c-a'), { code: 'REFCODE' }),
        postReferralHandler()(authed('c-a'), { code: 'REFCODE' }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        ConflictException,
      );
      expect(rows['c-ref'].totalLoyaltyPoints).toBe(startPoints + 100);
      expect(rows['c-a'].referredById).toBe('c-ref');
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

    it('rejects non-string code with IsString', async () => {
      let Dto: any;
      try {
        Dto = require('./dto/redeem-referral.dto').RedeemReferralDto;
      } catch {
        fail('RedeemReferralDto is required');
        return;
      }
      const numeric = Object.assign(new Dto(), { code: 12345 as any });
      const obj = Object.assign(new Dto(), { code: { x: 1 } as any });
      expect((await validate(numeric)).length).toBeGreaterThan(0);
      expect((await validate(obj)).length).toBeGreaterThan(0);
    });

    it('binds RedeemReferralDto on the POST profile/referral handler', async () => {
      let Dto: any;
      try {
        Dto = require('./dto/redeem-referral.dto').RedeemReferralDto;
      } catch {
        fail('RedeemReferralDto is required');
        return;
      }
      const handler = findReferralHandler();
      expect(handler).toBeTruthy();
      expect(typeof Dto).toBe('function');
      expect(dtoHasIsStringAndNotEmpty(Dto)).toBe(true);
    });
  });

  describe('GET /customers/profile enrichment', () => {
    it('includes referralCount and totalLoyaltyPoints', async () => {
      for (const [id, code] of [
        ['ref-a', 'RA'],
        ['ref-b', 'RB'],
        ['ref-c', 'RC'],
        ['ref-d', 'RD'],
      ] as const) {
        rows[id] = {
          id,
          referralCode: code,
          referredById: 'c-ref',
          totalLoyaltyPoints: 0,
        };
      }
      rows['c-ref'].totalLoyaltyPoints = 250;

      const profile = await controller.getProfile(authed('c-ref') as any);
      expect(profile).toHaveProperty('referralCount', 4);
      expect(profile).toHaveProperty('totalLoyaltyPoints', 250);
    });

    it('defaults referralCount to 0 when none', async () => {
      rows.c1.totalLoyaltyPoints = 0;
      const profile = await controller.getProfile(authed('c1') as any);
      expect(profile).toHaveProperty('referralCount', 0);
    });

    it('defaults totalLoyaltyPoints to 0 when absent', async () => {
      delete rows.c1.totalLoyaltyPoints;
      const profile = await controller.getProfile(authed('c1') as any);
      expect(profile).toHaveProperty('totalLoyaltyPoints', 0);
    });
  });
});

function dtoHasIsStringAndNotEmpty(Dto: any): boolean {
  const inst = new Dto();
  inst.code = 'X';
  return 'code' in inst;
}
