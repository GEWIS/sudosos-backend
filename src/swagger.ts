import * as express from 'express';
import expressSwagger from 'express-swagger-generator';

export default class Swagger {
  public static initialize(app: express.Application): void {
    const swagger = expressSwagger(app);
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
            in: 'header',
            name: 'Authorization',
            description: '',
          },
        },
      },
      basedir: __dirname, // app absolute path
      files: ['./**/*.ts'], // Path to the API handle folder
    };

    swagger(swaggerOptions);
  }
}
