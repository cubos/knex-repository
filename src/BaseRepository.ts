import type Knex from "knex";
import * as uuid from "uuid";

export interface BaseModel {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

type Insert<T extends BaseModel> = Omit<T, "createdAt" | "updatedAt" | "id"> & { id?: T["id"] };
type Filter<T extends BaseModel> = Partial<Omit<T, "createdAt" | "updatedAt">>;
type Update<T extends BaseModel> = Filter<T> & { id: T["id"] };

export class BaseRepository<T extends BaseModel> {
  constructor(private readonly knex: Knex, private readonly tableName: string) {}

  static async createTable(
    knex: Knex,
    tableName: string,
    tableBuilder: (table: Knex.CreateTableBuilder) => void,
    idColumnType: "text" | "uuid" = "uuid",
  ) {
    await knex.schema.createTable(tableName, table => {
      table[idColumnType]("id").primary();
      table.timestamp("createdAt").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updatedAt").notNullable().defaultTo(knex.fn.now());
      tableBuilder(table);
    });
  }

  static async dropTable(knex: Knex, tableName: string) {
    await knex.schema.dropTable(tableName);
  }

  static async alterTable(knex: Knex, tableName: string, tableBuilder: (tableBuilder: Knex.CreateTableBuilder) => void) {
    await knex.schema.alterTable(tableName, tableBuilder);
  }

  withTransaction(knex: Knex.Transaction) {
    return new BaseRepository<T>(knex, this.tableName);
  }

  private select() {
    return this.knex<T>(this.tableName).select();
  }

  /**
   * Insere um objeto e retorna a instância criada
   *
   * @param item objeto a ser inserido
   * @returns instância do objeto criado
   */
  async insert(item: Insert<T>) {
    const now = new Date();

    const [result] = (await this.knex(this.tableName)
      .insert({
        id: uuid.v4(),
        ...item,
        createdAt: now,
        updatedAt: now,
      })
      .returning("*")) as T[];

    return result;
  }

  /**
   * Insere múltiplos objetos e retorna as instâncias criadas
   *
   * @param items objetos a serem inseridos
   * @returns instância dos objetos criados
   */
  async insertAll(items: Array<Insert<T>>) {
    const now = new Date();

    return (await this.knex(this.tableName)
      .insert(
        items.map(item => ({
          id: uuid.v4(),
          ...item,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning("*")) as T[];
  }

  /**
   * Obtém a última versão de um objeto através de parâmetro(s) do mesmo
   *
   * @param condition parâmetros do objeto a serem utilizadas na condição de busca
   * @param queryBuilder callback síncrono possibilitando adicionar mais parâmetros na condição de busca
   * @returns instância do objeto ou undefined se não encontrado
   */
  async findOneBy(condition: Filter<T> | ((qb: Knex.QueryBuilder<T>) => unknown) = {}) {
    return this.select().where(condition).first() as Promise<T | undefined>;
  }

  /**
   * Obtém uma sequência de objetos de acordo com um limite e pagina de busca
   *
   * @param page página na qual deseja-se realizar a busca
   * @param pageSize limite de itens retornados pela busca
   * @param condition parâmetros dos objetos a serem utilizadas na condição de busca
   * @param queryBuilder callback síncrono possibilitando adicionar mais parâmetros na condição de busca
   * @returns objeto contendo o resultado e configurações da pesquisa
   */
  async findAllPaginated(page = 1, pageSize = 10, condition: Filter<T> | ((qb: Knex.QueryBuilder<T>) => unknown) = {}) {
    const rowCount = await this.count(condition);

    const result = (await this.select()
      .where(condition)
      .limit(pageSize)
      .offset((page - 1) * pageSize)) as T[];

    return {
      data: result,
      page,
      pageCount: Math.ceil(rowCount / pageSize),
      pageSize,
      rowCount,
    };
  }

  /**
   * Obtém a contagem de objetos através de parâmetro(s) do mesmo
   *
   * @param condition parâmetros do objeto a serem utilizadas na condição de busca
   * @param queryBuilder callback síncrono possibilitando adicionar mais parâmetros na condição de busca
   * @returns contagem de objetos
   */
  async count(condition: Filter<T> | ((qb: Knex.QueryBuilder<T>) => unknown) = {}) {
    const query = this.select().where(condition).count({ count: 1 }).first();

    return parseInt(((await query)?.count ?? "0").toString(), 10);
  }

  /**
   * Obtém a última versão de todos os objetos
   *
   * @returns array com a instância dos objetos
   */
  async findAll() {
    return this.select() as Promise<T[]>;
  }

  /**
   * Obtém a última versão de alguns objetos através de parâmetro(s) dos mesmos
   *
   * @param condition parâmetros dos objetos a serem utilizadas na condição de busca
   * @param queryBuilder callback síncrono possibilitando adicionar mais parâmetros na condição de busca
   * @returns array com a instância dos objetos encontrados
   */
  async findBy(condition: Filter<T> | ((qb: Knex.QueryBuilder<T>) => unknown)) {
    return this.select().where(condition) as Promise<T[]>;
  }

  /**
   * Obtém a última versão de um objeto através do identificador
   *
   * @param {string} id identificador do objeto
   * @param {Date} date opcionalmente uma data para realizar consultas na tabela de histórico
   * @returns {(Promise<T | undefined>)} instância do objeto ou undefined se não encontrado
   */
  async get(id: T["id"]): Promise<T | undefined> {
    return this.findOneBy({ id } as Filter<T>);
  }

  /**
   * Atualiza uma instância de um objeto
   *
   * @param item objeto a ser atualizado
   * @returns  objeto atualizado
   * @throws NotFound
   */
  async update(item: Update<T>): Promise<T> {
    const [updatedItem] = (await this.knex(this.tableName)
      .where({ id: item.id })
      .update({
        ...item,
        updatedAt: new Date(),
      })
      .returning("*")) as Array<T | undefined>;

    if (!updatedItem) {
      throw new Error("Not found");
    }

    return updatedItem;
  }

  /**
   * Exclui a instância de um objeto através do identificador
   *
   * @param id identificador do objeto
   * @returns objeto excluído
   * @throws NotFound
   */
  async delete(id: T["id"]) {
    const [deleted] = (await this.knex(this.tableName).where({ id }).delete().returning("*")) as Array<T | undefined>;

    if (!deleted) {
      throw new Error("Not found");
    }

    return deleted;
  }

  /**
   * Exclui múltiplas instâncias de um objeto através de uma condição
   *
   * @param condition parâmetros dos objetos a serem utilizadas na condição de busca
   * @returns objetos excluídos
   */
  async deleteBy(condition: Filter<T> | ((qb: Knex.QueryBuilder<T>) => unknown)) {
    return (await this.knex(this.tableName).where(condition).delete().returning("*")) as T[];
  }

  /**
   * Exclui todos os objetos da tabela.
   */
  async truncate() {
    await this.knex(this.tableName).truncate();
  }
}
