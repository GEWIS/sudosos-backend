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

/**
 * This is the module page of the swagger-service.
 *
 * @module internal/swagger
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import Validator, { SwaggerSpecification } from 'swagger-model-validator';
import expressJSDocSwagger from 'express-jsdoc-swagger';
import log4js, { Logger } from 'log4js';

export default class Swagger {
  private static logger: Logger = log4js.getLogger('SwaggerGenerator');

  /**
   * Generate Swagger specification on-demand and serve it.
   * @param app - The express application to mount on.
   * @param filesPattern - Glob pattern to find your jsdoc files
   * @returns The Swagger specification with model validator.
   */
  public static generateSpecification(app: express.Application, filesPattern: string[]): Promise<SwaggerSpecification> {
    return new Promise((resolve, reject) => {
      const options = {
        info: {
          version: process.env.npm_package_version ? process.env.npm_package_version : 'v1.0.0',
          title: process.env.npm_package_name ? process.env.npm_package_name : 'SudoSOS',
          description: process.env.npm_package_description ? process.env.npm_package_description : 'SudoSOS',
        },
        'schemes': [
          'http',
          'https',
        ],
        servers: [
          {
            url: `http://${process.env.API_HOST}${process.env.API_BASEPATH}`,
            description: 'Development server',
          },
        ],
        security: {
          JWT: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        baseDir: __dirname,
        // Glob pattern to find your jsdoc files
        filesPattern,
        exposeApiDocs: true, // Expose API Docs JSON
        apiDocsPath: '/api-docs.json',
      };

      const instance = expressJSDocSwagger(app)(options);

      instance.on('finish', async (swaggerObject) => {
        Swagger.logger.trace('Swagger specification generation finished');
        new Validator(swaggerObject);
        await fs.writeFile(
          path.join(process.cwd(), 'out/swagger.json'),
          JSON.stringify(swaggerObject),
          { encoding: 'utf-8' },
        ).catch((e) => {
          console.error(e);
        });
        instance.removeAllListeners();
        resolve(swaggerObject); // Resolve the promise with the swaggerObject
      });

      instance.on('error', (error) => {
        Swagger.logger.error('Error generating Swagger specification:', error);
        instance.removeAllListeners();
        reject(error); // Reject the promise in case of an error
      });
    });
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
      specification.info = {
        version: process.env.npm_package_version ? process.env.npm_package_version : 'v1.0.0',
        title: process.env.npm_package_name ? process.env.npm_package_name : 'SudoSOS',
        description: process.env.npm_package_description ? process.env.npm_package_description : 'SudoSOS',
      };
      specification.servers = [
        {
          url: `https://${process.env.API_HOST}${process.env.API_BASEPATH}`,
          description: 'Production server',
        },
      ];
      app.use('/api-docs.json', (_, res) => res.json(specification));
      app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specification));
      return specification;
    }

    return Swagger.generateSpecification(app, [
      '../controller/*.ts',
      '../helpers/pagination.ts',

      '../controller/request/*.ts',
      '../controller/response/*.ts',
      '../controller/response/**/*.ts',
      '../gewis/controller/**/*.ts',
    ]);
  }
}

if (require.main === module) {
  // Only execute directly if this is the main execution file.
  const app = express();

  void fs.mkdir('out', { recursive: true })
    .then(async () => { await Swagger.initialize(app); });
}
