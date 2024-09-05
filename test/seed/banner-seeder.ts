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
 */
import WithManager from '../../src/with-manager';
import Banner from '../../src/entity/banner';
import User, { UserType } from '../../src/entity/user/user';
import BannerImage from '../../src/entity/file/banner-image';
import path from 'path';
import { BANNER_IMAGE_LOCATION } from '../../src/files/storage';
import fs from 'fs';

export default class BannerSeeder extends WithManager {
  /**
   * Create a BannerImage object. When not in a testing environment, a banner image
   * will also be saved on disk.
   *
   * @param banner
   * @param createdBy
   */
  public defineBannerImage(banner: Banner, createdBy: User): BannerImage {
    const downloadName = `banner-${banner.id}.png`;

    let location;
    if (process.env.NODE_ENV !== 'test') {
      const source = path.join(__dirname, './static/banner.png');
      location = path.join(__dirname, '../', BANNER_IMAGE_LOCATION, downloadName);
      fs.copyFileSync(source, location);
    } else {
      location = `fake/storage/${downloadName}`;
    }

    return Object.assign(new BannerImage(), {
      id: banner.id,
      location,
      downloadName,
      createdBy,
    });
  }

  /**
   * Seeds a default dataset of banners based on the given users.
   * When not in a testing environment, actual images will also be saved to disk.
   * @param users
   */
  public async seedBanners(users: User[]): Promise<{
    banners: Banner[],
    bannerImages: BannerImage[],
  }> {
    const banners: Banner[] = [];
    const bannerImages: BannerImage[] = [];

    const creators = users.filter((u) => [UserType.LOCAL_ADMIN].includes(u.type));

    for (let i = 0; i < creators.length * 4; i += 1) {
      const banner = Object.assign(new Banner(), {
        id: i + 1,
        name: `Banner-${i + 1}`,
        duration: Math.floor(Math.random() * (300 - 60) + 60),
        active: i % 2 === 0,
        startDate: new Date(),
        endDate: new Date(),
      });

      if (i % 4 !== 0) {
        banner.image = this.defineBannerImage(banner, creators[i % creators.length]);
        bannerImages.push(banner.image);
      }

      banners.push(banner);
    }

    await Promise.all(bannerImages.map((image) => this.manager.save(BannerImage, image)));
    await Promise.all(banners.map((banner) => this.manager.save(Banner, banner)));

    return { banners, bannerImages };
  }
}
