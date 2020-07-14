import express, { Application, Request } from 'express';
import { expect, request } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import bodyParser from 'body-parser';
import BaseController from '../../../src/controller/base-controller';
import Policy from '../../../src/controller/policy';
import { getSpecification } from '../entity/transformer/test-model';

class TestController extends BaseController {
  // eslint-disable-next-line class-methods-use-this
  public getPolicy(): Policy {
    return {
      '/get/:id(\\d+)': {
        GET: {
          policy: async (req: Request) => Number(req.params.id) === 1,
          handler: (req, res) => res.json('test'),
        },
      },
      '/get/:id(\\d+)/list': {
        POST: {
          policy: async () => true,
          handler: (req, res) => res.json('list'),
        },
      },
      '/test': {
        GET: {
          policy: async () => true,
          handler: (req, res) => res.json('test-1'),
        },
        POST: {
          policy: async () => true,
          handler: (req, res) => res.json('test-2'),
        },
        PATCH: {
          policy: async () => true,
          handler: (req, res) => res.json('test-3'),
        },
        DELETE: {
          policy: async () => true,
          handler: (req, res) => res.json('test-4'),
        },
      },
      '/model': {
        POST: {
          body: { modelName: 'TestModel' },
          policy: async () => true,
          handler: (req, res) => res.json('test-model'),
        },
      },
    };
  }
}

describe('BaseController', (): void => {
  let ctx: {
    app: Application,
    specification: SwaggerSpecification,
    controller: BaseController,
  };

  before(async () => {
    // Initialize context
    ctx = {
      app: express(),
      specification: undefined,
      controller: undefined,
    };
    ctx.specification = await getSpecification(ctx.app);
    ctx.controller = new TestController(ctx.specification);

    ctx.app.use(bodyParser.json());
    ctx.app.use(ctx.controller.getRouter());
  });

  describe('#handle', () => {
    it('should give an HTTP 403 when policy implementation returns false', async () => {
      const res = await request(ctx.app)
        .get('/get/2');
      expect(res.status).to.equal(403);
    });
    it('should give an HTTP 405 when requested method is not supported', async () => {
      const res = await request(ctx.app)
        .post('/get/1');
      expect(res.status).to.equal(405);
    });
    it('should not give an HTTP 405 when requested method for child route with method support', async () => {
      const res = await request(ctx.app)
        .post('/get/1/list');
      expect(res.status).to.equal(200);
      expect(res.body).to.equal('list');
    });
    it('should give an HTTP 200 when policy implementation returns true and method is supported', async () => {
      const res = await request(ctx.app)
        .get('/get/1');
      expect(res.status).to.equal(200);
    });
    it('should give content for appropriate method', async () => {
      const resGet = await request(ctx.app)
        .get('/test');
      expect(resGet.status).to.equal(200);
      expect(resGet.body).to.equal('test-1');

      const resPost = await request(ctx.app)
        .post('/test');
      expect(resPost.status).to.equal(200);
      expect(resPost.body).to.equal('test-2');

      const resPatch = await request(ctx.app)
        .patch('/test');
      expect(resPatch.status).to.equal(200);
      expect(resPatch.body).to.equal('test-3');

      const resDelete = await request(ctx.app)
        .delete('/test');
      expect(resDelete.status).to.equal(200);
      expect(resDelete.body).to.equal('test-4');
    });
    it('should give an HTTP 400 when body model incorrect', async () => {
      const res = await request(ctx.app)
        .post('/model')
        .send({
          name: 'Test',
          value: '123',
        });
      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 200 when body model correct', async () => {
      const res = await request(ctx.app)
        .post('/model')
        .send({
          name: 'Test',
          value: 123,
        });
      expect(res.status).to.equal(200);
    });
  });
});
