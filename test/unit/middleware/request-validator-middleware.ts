import express, { Application, Response } from 'express';
import { expect, request } from 'chai';
import { SwaggerSpecification } from 'swagger-model-validator';
import bodyParser from 'body-parser';
import RequestValidatorMiddleware from '../../../src/middleware/request-validator-middleware';
import { getSpecification, TestModel } from '../entity/transformer/test-model';

describe('RequestValidatorMiddleware', (): void => {
  let ctx: {
    app: Application,
    value: TestModel,
    specification: SwaggerSpecification,
  };

  before(async () => {
    // Initialize context
    ctx = {
      app: express(),
      specification: undefined,
      value: {
        name: 'Test Model',
        value: 123,
      },
    };
    ctx.specification = await getSpecification(ctx.app);

    ctx.app.use(bodyParser.json());
    ctx.app.post('/test', new RequestValidatorMiddleware(
      ctx.specification, { modelName: 'TestModel' },
    ).getMiddleware());
    ctx.app.post('/test-extra', new RequestValidatorMiddleware(
      ctx.specification, { modelName: 'TestModel', allowExtraProperties: true },
    ).getMiddleware());
    ctx.app.post('/test-blank', new RequestValidatorMiddleware(
      ctx.specification, { modelName: 'TestModel', allowBlankTarget: true },
    ).getMiddleware());
    ctx.app.use((req: any, res: Response) => {
      res.end('Success');
    });
  });

  describe('#constructor', () => {
    it('should not be able to create when model is not defined', async () => {
      const f = () => new RequestValidatorMiddleware(
        ctx.specification,
        { modelName: 'TestModel2' },
      );
      expect(f).to.throw("Model 'TestModel2' not defined.");
    });
  });

  describe('#handle', () => {
    it('should give an HTTP 400 when model is missing property', async () => {
      const value = { ...ctx.value };
      delete value.value;
      const res = await request(ctx.app)
        .post('/test')
        .send(value);

      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 400 when model has extra property when not allowed', async () => {
      const value = { ...ctx.value, value2: 1234 };
      const res = await request(ctx.app)
        .post('/test')
        .send(value);

      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 200 when model has extra property when allowed', async () => {
      const value = { ...ctx.value, value2: 1234 };
      const res = await request(ctx.app)
        .post('/test-additional')
        .send(value);

      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 400 when blank model not allowed', async () => {
      const res = await request(ctx.app)
        .post('/test')
        .send({});

      expect(res.status).to.equal(400);
    });
    it('should give an HTTP 200 when blank model allowed', async () => {
      const res = await request(ctx.app)
        .post('/test-additional')
        .send({});

      expect(res.status).to.equal(200);
    });
    it('should give an HTTP 200 when model is correct', async () => {
      const res = await request(ctx.app)
        .post('/test')
        .send(ctx.value);

      expect(res.status).to.equal(200);
    });
  });
});
