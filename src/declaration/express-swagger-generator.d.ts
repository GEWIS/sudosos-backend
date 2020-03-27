declare module 'express-swagger-generator' {
  import express from 'express';

  export default function generateSpecAndMount(app: express.Application):
  (options: object) => object;
}
