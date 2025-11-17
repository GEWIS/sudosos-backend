/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 *  @license
 */

import { describe } from 'mocha';
import { DataSource } from 'typeorm';
import { expect } from 'chai';
import BannerService, { BannerFilterParameters } from '../../../src/service/banner-service';
import Banner from '../../../src/entity/banner';
import { defaultBefore, finishTestDB } from '../../helpers/test-helpers';
import BannerSeeder from '../../seed/banner-seeder';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';

describe('BannerService', () => {
  let ctx: {
    connection: DataSource,
    banners: Banner[],
    users: User[],
  };


  before(async () => {
    ctx = {
      ...(await defaultBefore()),
    } as any;
    
    // Create dummy users
    const adminUser = {
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
    } as User;

    await User.save(adminUser);

    const { banners } = await new BannerSeeder().seed([adminUser]);
    
    ctx.banners = banners;
    ctx.users = [adminUser];
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  describe('getBanners', () => {
    it('should return all banners when no filters are applied', async () => {
      const result = await BannerService.getBanners({});
      expect(result.records.length).to.equal(ctx.banners.length);
      expect(result._pagination.count).to.equal(ctx.banners.length);
    });

    it('should filter by active=true', async () => {
      const filters: BannerFilterParameters = { active: true };
      const result = await BannerService.getBanners(filters);
      const activeBanners = ctx.banners.filter((b) => b.active);

      expect(result.records.length).to.equal(activeBanners.length);
      expect(result._pagination.count).to.equal(activeBanners.length);
      result.records.forEach((banner) => {
        const originalBanner = ctx.banners.find((b) => b.id === banner.id);
        expect(originalBanner.active).to.be.true;
      });
    });

    it('should filter by active=false', async () => {
      const filters: BannerFilterParameters = { active: false };
      const result = await BannerService.getBanners(filters);
      const inactiveBanners = ctx.banners.filter((b) => !b.active);

      expect(result.records.length).to.equal(inactiveBanners.length);
      expect(result._pagination.count).to.equal(inactiveBanners.length);
      result.records.forEach((banner) => {
        const originalBanner = ctx.banners.find((b) => b.id === banner.id);
        expect(originalBanner.active).to.be.false;
      });
    });

    it('should filter by expired=true', async () => {
      // Create an expired banner
      const expiredBanner = Object.assign(new Banner(), {
        name: 'Expired Banner',
        duration: 10,
        active: true,
        startDate: new Date('2000-01-01'),
        endDate: new Date('2000-01-02'),
      });
      await Banner.save(expiredBanner);

      const filters: BannerFilterParameters = { expired: true };
      const result = await BannerService.getBanners(filters);

      for (const banner of result.records) {
        const dbBanner = await Banner.findOne({ where: { id: banner.id } });
        expect(dbBanner.endDate.getTime()).to.be.at.most(new Date().getTime());
      }

      // Cleanup
      await Banner.delete(expiredBanner.id);
    });

    it('should filter by expired=false', async () => {
      // Create a future banner
      const futureBanner = Object.assign(new Banner(), {
        name: 'Future Banner',
        duration: 10,
        active: true,
        startDate: new Date('3000-01-01'),
        endDate: new Date('3000-01-02'),
      });
      await Banner.save(futureBanner);

      const filters: BannerFilterParameters = { expired: false };
      const result = await BannerService.getBanners(filters);

      for (const banner of result.records) {
        const dbBanner = await Banner.findOne({ where: { id: banner.id } });
        expect(dbBanner.endDate.getTime()).to.be.greaterThan(new Date().getTime());
      }

      // Cleanup
      await Banner.delete(futureBanner.id);
    });

    it('should order by startDate ASC', async () => {
      const filters: BannerFilterParameters = { order: 'ASC' };
      const result = await BannerService.getBanners(filters);

      for (let i = 1; i < result.records.length; i += 1) {
        const prevDate = new Date(result.records[i - 1].startDate).getTime();
        const currDate = new Date(result.records[i].startDate).getTime();
        expect(currDate).to.be.at.least(prevDate);
      }
    });

    it('should order by startDate DESC', async () => {
      const filters: BannerFilterParameters = { order: 'DESC' };
      const result = await BannerService.getBanners(filters);

      for (let i = 1; i < result.records.length; i += 1) {
        const prevDate = new Date(result.records[i - 1].startDate).getTime();
        const currDate = new Date(result.records[i].startDate).getTime();
        expect(currDate).to.be.at.most(prevDate);
      }
    });

    it('should default to DESC order when order is not specified', async () => {
      const result = await BannerService.getBanners({});

      for (let i = 1; i < result.records.length; i += 1) {
        const prevDate = new Date(result.records[i - 1].startDate).getTime();
        const currDate = new Date(result.records[i].startDate).getTime();
        expect(currDate).to.be.at.most(prevDate);
      }
    });

    it('should combine active and expired filters', async () => {
      // Create an active, non-expired banner
      const activeFutureBanner = Object.assign(new Banner(), {
        name: 'Active Future Banner',
        duration: 10,
        active: true,
        startDate: new Date('3000-01-01'),
        endDate: new Date('3000-01-02'),
      });
      await Banner.save(activeFutureBanner);

      const filters: BannerFilterParameters = { active: true, expired: false };
      const result = await BannerService.getBanners(filters);

      for (const banner of result.records) {
        const dbBanner = await Banner.findOne({ where: { id: banner.id } });
        expect(dbBanner.active).to.be.true;
        expect(dbBanner.endDate.getTime()).to.be.greaterThan(new Date().getTime());
      }

      // Cleanup
      await Banner.delete(activeFutureBanner.id);
    });

    it('should combine all filters with order', async () => {
      const filters: BannerFilterParameters = { active: true, order: 'ASC' };
      const result = await BannerService.getBanners(filters);

      result.records.forEach((banner) => {
        const originalBanner = ctx.banners.find((b) => b.id === banner.id);
        expect(originalBanner.active).to.be.true;
      });

      for (let i = 1; i < result.records.length; i += 1) {
        const prevDate = new Date(result.records[i - 1].startDate).getTime();
        const currDate = new Date(result.records[i].startDate).getTime();
        expect(currDate).to.be.at.least(prevDate);
      }
    });

    it('should respect pagination parameters', async () => {
      const take = 2;
      const skip = 1;
      const result = await BannerService.getBanners({}, { take, skip });

      expect(result.records.length).to.be.at.most(take);
      expect(result._pagination.take).to.equal(take);
      expect(result._pagination.skip).to.equal(skip);
    });

    it('should filter by bannerId', async () => {
      const targetBanner = ctx.banners[0];
      const filters: BannerFilterParameters = { bannerId: targetBanner.id };
      const result = await BannerService.getBanners(filters);

      expect(result.records.length).to.equal(1);
      expect(result.records[0].id).to.equal(targetBanner.id);
    });
  });
});

