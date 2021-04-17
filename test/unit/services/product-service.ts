import {Connection} from "typeorm";
import {Application} from "express";
import {SwaggerSpecification} from "swagger-model-validator";
import User from "../../../src/entity/user/user";

describe('ProductService', async (): Promise<void> => {
  let ctx: {
    connection: Connection,
    app: Application,
    specification: SwaggerSpecification,
    adminUser: User,
    localUser: User,
    adminToken: String,
    token: String,
  };


});