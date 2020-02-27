declare module 'express-swagger-generator' {
  import express from 'express';

  function expressSwagger(app: express.Application): (options: any) => void;
  export = expressSwagger;
}
