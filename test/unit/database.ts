import Database from '../../src/database';

describe('Database', (): void => {
  describe('#initialize', () => {
    it('should be able to synchronize schema', async () => {
      const connection = await Database.initialize();
      await connection.synchronize();
      await connection.close();
    });
  });
});
