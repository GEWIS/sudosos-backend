import { expect, request } from 'chai';
import createApp, { Application } from '../../src';

describe('Swagger', (): void => {
  let ctx: {
    app: Application,
  };

  beforeEach('create app', async () => {
    ctx = {
      app: await createApp(),
    };
  });

  afterEach('stop app', async () => {
    await ctx.app.stop();
  });

  it('should serve JSON spec', (): void => {
    request(ctx.app.app)
      .get('/api-docs.json')
      .then((res) => {
        expect(res).to.be.json;
      });
  });

  it('should serve HTML interface', (): void => {
    request(ctx.app.app)
      .get('/api-docs')
      .then((res) => {
        expect(res).to.be.html;
      });
  });

  it('should serve the correct specification', (): void => {
    const spec = ctx.app.app.get('swagger-spec');
    request(ctx.app.app)
      .get('/api-docs.json')
      .then((res) => {
        expect(res.body).to.deep.equal(spec);
      });
  });
});
