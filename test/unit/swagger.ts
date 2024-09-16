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

import { expect, request } from 'chai';
import express from 'express';
import createApp, { Application } from '../../src';
import Swagger from '../../src/start/swagger';

describe('Swagger', (): void => {
  let ctx: {
    app: Application,
  };

  before('create app', async () => {
    process.env.ENABLE_LDAP = undefined;
    ctx = {
      app: await createApp(),
    };
  });

  after('stop app', async () => {
    await ctx.app.stop();
  });

  it('should be able to generate specification in development environment', async (): Promise<void> => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const app = express();
    const specification = await Swagger.initialize(app);
    expect(specification.components.schemas).to.exist;
    const res = await request(app)
      .get('/api-docs.json');
    expect(res.status).to.equal(200);

    process.env.NODE_ENV = env;
  });

  it('should be able to import specification in production environment', async (): Promise<void> => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const app = express();
    const specification = await Swagger.initialize(app);
    expect(specification.components.schemas).to.exist;
    const res = await request(app)
      .get('/api-docs.json');
    expect(res.status).to.equal(200);

    process.env.NODE_ENV = env;
  });

  it('should serve JSON spec', async (): Promise<void> => {
    const res = await request(ctx.app.app)
      .get('/api-docs.json');
    expect(res).to.be.json;
  });

  it('should serve HTML interface', async (): Promise<void> => {
    const res = await request(ctx.app.app)
      .get('/api-docs');
    expect(res).to.be.html;
  });

  it('should serve the correct specification', async (): Promise<void> => {
    const res = await request(ctx.app.app)
      .get('/api-docs.json');

    // Re-parse specification to get rid of all non-stringifyable functions like 'validateModel'.
    const parsed = JSON.parse(JSON.stringify(ctx.app.specification));
    expect(res.body).to.deep.equal(parsed);
  });
});
