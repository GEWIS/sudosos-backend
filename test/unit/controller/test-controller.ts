/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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

import { expect } from 'chai';
import sinon, { SinonSandbox } from 'sinon';
import TestController from '../../../src/controller/test-controller';
import Notifier from '../../../src/notifications';
import { NotificationTypes } from '../../../src/notifications/notification-types';

describe('TestController', () => {
  let sandbox: SinonSandbox;
  let logger: { trace: sinon.SinonSpy };
  let res: {
    status: sinon.SinonStub;
    send: sinon.SinonStub;
    json: sinon.SinonStub;
  };
  const reqFor = (userId: number, firstName: string) => ({
    token: { user: { id: userId, firstName } },
  }) as any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    logger = { trace: sinon.spy() };
    res = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub(),
      json: sinon.stub(),
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getPolicy', () => {
    it('should expose POST /helloworld with an always-allow policy', async () => {
      const policy = TestController.prototype.getPolicy.call(TestController.prototype);
      const route = policy['/helloworld'];
      expect(route).to.not.be.undefined;
      expect(route.POST).to.not.be.undefined;
      expect(route.POST!.handler).to.be.a('function');
      const allowed = await route.POST!.policy({} as any);
      expect(allowed).to.equal(true);
    });
  });

  describe('helloWorld', () => {
    it('should send a 204 after dispatching a HelloWorld notification', async () => {
      const notifyStub = sandbox.stub().resolves();
      sandbox.stub(Notifier, 'getInstance').returns({ notify: notifyStub } as any);

      await TestController.prototype.helloWorld.call(
        { logger } as any,
        reqFor(1, 'Alice'),
        res as any,
      );

      expect(notifyStub.calledOnce).to.be.true;
      const arg = notifyStub.firstCall.args[0];
      expect(arg.type).to.equal(NotificationTypes.HelloWorld);
      expect(arg.userId).to.equal(1);
      expect(arg.params.name).to.equal('Alice');
      expect(res.status.calledOnceWith(204)).to.be.true;
      expect(res.send.calledOnce).to.be.true;
    });

    it('should respond with 500 if the notifier throws', async () => {
      const notifyStub = sandbox.stub().rejects(new Error('boom'));
      sandbox.stub(Notifier, 'getInstance').returns({ notify: notifyStub } as any);

      await TestController.prototype.helloWorld.call(
        { logger } as any,
        reqFor(2, 'Bob'),
        res as any,
      );

      expect(notifyStub.calledOnce).to.be.true;
      expect(res.status.calledOnceWith(500)).to.be.true;
      expect(res.json.calledOnceWith('Internal server error.')).to.be.true;
    });
  });
});
