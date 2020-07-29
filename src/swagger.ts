/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
/* eslint-disable no-new */
import { promises as fs } from 'fs';
import * as path from 'path';
import express from 'express';
import swaggerUi from 'express-swaggerize-ui';
import Validator, { SwaggerSpecification } from 'swagger-model-validator';
import generateSpecAndMount from 'express-swagger-generator';

export default class Swagger {
  /**
   * Generate Swagger specification on-demand and serve it.
   * @param app - The express application to mount on.
   * @param files - The files that need to be parsed.
   * @returns The Swagger specification with model validator.
   */
  public static generateSpecification(app: express.Application, ...files: string[])
    : SwaggerSpecification {
    const swagger = generateSpecAndMount(app);
    const swaggerOptions = {
      swaggerDefinition: {
        info: {
          title: process.env.npm_package_name,
          description: process.env.npm_package_description,
          version: process.env.npm_package_version,
        },
        host: 'localhost:3000',
        basePath: '/v1',
        produces: [
          'application/json',
        ],
        schemes: ['http', 'https'],
        securityDefinitions: {
          JWT: {
            type: 'apiKey',
            scheme: 'bearer',
            in: 'header',
            name: 'Authorization',
            description: '',
          },
        },
      },
      basedir: __dirname, // app absolute path
      files,
    };

    const swaggerSpec = swagger(swaggerOptions) as SwaggerSpecification;
    new Validator(swaggerSpec);
    return swaggerSpec;
  }

  /**
   * Imports a pre-generated Swagger specification file.
   * @param file - The path to the Swagger JSON file.
   */
  public static async importSpecification(file = 'out/swagger.json'): Promise<SwaggerSpecification> {
    const contents = await fs.readFile(file, 'utf-8');
    const swaggerSpec = JSON.parse(contents);
    new Validator(swaggerSpec);
    return swaggerSpec;
  }

  /**
   * Initializes the Swagger specification for the current environment and serve it.
   * Depending on the NODE_ENV, it will be generated on-demand or import a pre-generated
   * specification.
   * @param app - The express application which will serve the specification.
   */
  public static async initialize(app: express.Application): Promise<SwaggerSpecification> {
    if (process.env.NODE_ENV === 'production') {
      // Serve pre-generated Swagger specification in production environments.
      const specification = await Swagger.importSpecification();
      app.use('/api-docs.json', (_, res) => res.json(specification));
      app.use('/api-docs', swaggerUi());
      return specification;
    }

    // Generate Swagger specification on-demand in development environments.
    return Swagger.generateSpecification(app,
      path.join(process.cwd(), 'src/entity/*.ts'),
      path.join(process.cwd(), 'src/declaration/*.ts'),
      path.join(process.cwd(), 'src/controller/*.ts'),
      path.join(process.cwd(), 'src/controller/request/*.ts'));
  }
}

if (require.main === module) {
  // Only execute directly if this is the main execution file.
  const app = express();
  fs.mkdir('out', { recursive: true })
    .then(() => Swagger.initialize(app))
    .then((specification) => fs.writeFile(
      path.join(process.cwd(), 'out/swagger.json'),
      JSON.stringify(specification),
      { encoding: 'utf-8' },
    ));
}
