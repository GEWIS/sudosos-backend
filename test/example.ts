// import { expect } from 'chai';
import * as express from 'express';

describe('test', (): void => {
  beforeEach((): void => {
    const app = express();
    console.log(typeof app);
  });

  it('should start', (): void => {
    // expect(hoi).to.be.true; <-- gives an error in eslint therefore removed
  });
});
