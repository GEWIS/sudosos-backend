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

import { expect, request } from 'chai';
import dinero from 'dinero.js';
import express, { Application, json } from "express";
import { SwaggerSpecification } from "swagger-model-validator";
import { Connection } from "typeorm";
import TokenHandler from "../../../src/authentication/token-handler";
import TransferRequest from "../../../src/controller/request/transfer-request";
import { TransferResponse } from '../../../src/controller/response/transfer-response';
import TransferController from "../../../src/controller/transfer-controller";
import Database from "../../../src/database/database";
import Transfer, { TransferType } from "../../../src/entity/transactions/transfer";
import User, { UserType } from "../../../src/entity/user/user";
import TokenMiddleware from '../../../src/middleware/token-middleware';
import RoleManager from '../../../src/rbac/role-manager';
import Swagger from '../../../src/start/swagger';
import { seedTransfers, seedUsers } from "../../seed";


describe('TransferController', async (): Promise<void> => {
    let connection: Connection,
        app: Application,
        adminToken: String,
        token: String,
        validRequest: TransferRequest,
        invalidRequest: TransferRequest;

    before(async () => {
        // initialize test database
        connection = await Database.initialize();

        // create dummy users
        let adminUser = {
            id: 1,
            firstName: 'Admin',
            type: UserType.LOCAL_ADMIN,
            active: true,
        } as User;

        let localUser = {
            id: 2,
            firstName: 'User',
            type: UserType.LOCAL_USER,
            active: true,
        } as User;

        await User.save(adminUser);
        await User.save(localUser);

        let users = await seedUsers();
        let transfers = await seedTransfers(users);

        // create bearer tokens
        let tokenHandler = new TokenHandler({
            algorithm: 'HS256', publicKey: 'test', privateKey: 'test', expiry: 3600,
        });
        adminToken = await tokenHandler.signToken({ user: adminUser, roles: ['Admin'] }, 'nonce admin');
        token = await tokenHandler.signToken({ user: localUser, roles: [] }, 'nonce');

        //create valid and invaled request
        validRequest = {
            amount: {
                amount: 10,
                precision: dinero.defaultPrecision,
                currency: dinero.defaultCurrency,
            },
            type: TransferType.CUSTOM,
            description: "cool",
            fromId: 1,
            toId: null,
        }

        invalidRequest = {
            amount: {
                amount: 10,
                precision: dinero.defaultPrecision,
                currency: dinero.defaultCurrency,
            },
            type: null, //invalid type
            description: "cool",
            fromId: 1,
            toId: null,
        }

        // start app
        app = express();
        let specification = await Swagger.initialize(app);

        let all = { all: new Set<string>(['*']) };

        // Create roleManager and set roles of Admin and User
        // In this case Admin can do anything and User nothing.
        // This does not reflect the actual roles of the users in the final product.
        let roleManager = new RoleManager();
        roleManager.registerRole({
            name: 'Admin',
            permissions: {
                Transfer: {
                    create: all,
                    get: all,
                    update: all,
                    delete: all,
                },
            },
            assignmentCheck: async (user: User) => user.type === UserType.LOCAL_ADMIN,
        });

        let controller = new TransferController({ specification, roleManager });
        app.use(json());
        app.use(new TokenMiddleware({ tokenHandler, refreshFactor: 0.5 }).getMiddleware());
        app.use('/transfers', controller.getRouter());
    })

    after(async () => {
        await connection.close();
    })

    describe('GET /transfers', () => {
        it('should return an HTTP 200 and all existing transfers in the database if admin', async () => {
            const res = await request(app)
                .get('/transfers/')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).to.equal(200);

            const TransferCount = await Transfer.count();
            expect((res.body as TransferResponse[]).length).to.equal(TransferCount);
        });
        it('should return an HTTP 403 if not admin', async () => {
            const res = await request(app)
                .get('/transfers')
                .set('Authorization', `Bearer ${token}`);

            expect(res.body).to.be.empty;
            expect(res.status).to.equal(403);
        });
    })

    describe('GET /transfers/:id', () => {
        it('should return an HTTP 200 and the transfer with given id if admin', async () => {
            const res = await request(app)
                .get('/transfers/1')
                .set('Authorization', `Bearer ${adminToken}`);

            expect((res.body as TransferResponse).id).to.equal(1);
            expect(res.status).to.equal(200);
        });
        it('should return an HTTP 403 if not admin', async () => {
            const res = await request(app)
                .get('/transfers/1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.body).to.be.empty;
            expect(res.status).to.equal(403);
        });
        it('should return an HTTP 404 if the transfer with the given id does not exist', async () => {
            const transferCount = await Transfer.count();
            const res = await request(app)
                .get(`/transfers/${transferCount + 1}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(await Transfer.findOne(transferCount + 1)).to.be.undefined;
            expect(res.body).to.equal('Transfer not found.');
            expect(res.status).to.equal(404);
        });
    })

    describe('POST /transfers', () => {
        it('should store the given transfer in the database and return an HTTP 200 and the product if admin', async () => {
            const transferCount = await Transfer.count();
            const res = await request(app)
                .post('/transfers')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(validRequest);

            expect(res.status).to.equal(200);
            expect(await Transfer.count()).to.equal(transferCount + 1);
            const databaseEntry = await Transfer.findOne((res.body as TransferResponse).id);
            expect(databaseEntry).to.exist;
        });
        it('should return an HTTP 400 if the given transfer is invalid', async () => {
            const transferCount = await Transfer.count();
            const res = await request(app)
                .post('/transfers')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidRequest);

            expect(await Transfer.count()).to.equal(transferCount);
            expect(res.body).to.equal('Invalid transfer.');
            expect(res.status).to.equal(400);
        });
        it('should return an HTTP 403 if not admin', async () => {
            const transferCount = await Transfer.count();
            const res = await request(app)
                .post('/transfers')
                .set('Authorization', `Bearer ${token}`)
                .send(validRequest);

            expect(await Transfer.count()).to.equal(transferCount);
            expect(res.body).to.be.empty;
            expect(res.status).to.equal(403);
        });
    })
});