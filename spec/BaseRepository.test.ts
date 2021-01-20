import { randomBytes } from "crypto";

import Knex from "knex";

import { BaseRepository } from "../src";

const knexConfig = {
  client: "pg",
  connection: {
    database: "postgres",
    host: process.env.DB_HOST ?? "localhost",
    password: process.env.DB_PASSWORD ?? "postgres",
    user: process.env.DB_USER ?? "postgres",
  },
};

describe("BaseRepository", () => {
  const database = `test_${randomBytes(8).toString("hex")}`;
  const masterConn = Knex(knexConfig);
  const knex = Knex({ ...knexConfig, connection: { ...knexConfig.connection, database } });

  beforeAll(async () => {
    await masterConn.raw(`CREATE DATABASE ${database}`);
    await knex.raw(`SELECT 1`);
  });

  afterAll(async () => {
    await knex.destroy();
    await masterConn.raw(`DROP DATABASE ${database}`);
    await masterConn.destroy();
  });

  it("throws when getting a service that wasn't registered", async () => {
    await BaseRepository.createTable(knex, "something", table => {
      table.text("name");
    });

    interface Something {
      name: string;
    }

    const repo = new BaseRepository<Something>(knex, "something");

    expect(await repo.findAll()).toHaveLength(0);
  });
});
