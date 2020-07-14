import * as express from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import Swagger from '../../../../src/swagger';
import { sourceFile } from '../../../setup';

/**
 * @typedef TestModel
 * @property {string} name.required - The name of the model.
 * @property {number} value.required - A test value.
 */
export class TestModel {
  name: string;

  value: number;
}

export async function getSpecification(app: express.Application): Promise<SwaggerSpecification> {
  return Swagger.generateSpecification(app, sourceFile(__filename));
}
