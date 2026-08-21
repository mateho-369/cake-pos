const fs = require('node:fs')
const path = require('node:path')
const initSqlJs = require('sql.js')

function normalizeParams(params) {
  return params.map((value) => value === undefined ? null : value)
}

class Statement {
  constructor(store, sql) {
    this.store = store
    this.sql = sql
  }

  get(...params) {
    const statement = this.store.database.prepare(this.sql)
    try {
      statement.bind(normalizeParams(params))
      if (!statement.step()) return undefined
      return statement.getAsObject()
    } finally {
      statement.free()
    }
  }

  all(...params) {
    const statement = this.store.database.prepare(this.sql)
    const rows = []
    try {
      statement.bind(normalizeParams(params))
      while (statement.step()) rows.push(statement.getAsObject())
      return rows
    } finally {
      statement.free()
    }
  }

  run(...params) {
    const statement = this.store.database.prepare(this.sql)
    try {
      statement.run(normalizeParams(params))
    } finally {
      statement.free()
    }
    const result = {
      changes: this.store.database.getRowsModified(),
      lastInsertRowid: this.store.database.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0] ?? 0,
    }
    this.store.persistIfReady()
    return result
  }
}

class SqliteStore {
  constructor(database, filePath) {
    this.database = database
    this.filePath = filePath
    this.transactionDepth = 0
    this.dirty = false
  }

  prepare(sql) {
    return new Statement(this, sql)
  }

  exec(sql) {
    this.database.exec(sql)
    this.persistIfReady()
  }

  pragma() {
    // SQL.js is already an in-process SQLite database. WAL is not applicable here.
  }

  transaction(callback) {
    this.database.exec('BEGIN IMMEDIATE')
    this.transactionDepth += 1
    try {
      const result = callback()
      this.transactionDepth -= 1
      this.database.exec('COMMIT')
      this.dirty = true
      this.persistIfReady()
      return result
    } catch (error) {
      this.transactionDepth = Math.max(0, this.transactionDepth - 1)
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  persistIfReady() {
    this.dirty = true
    if (this.transactionDepth > 0) return
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, Buffer.from(this.database.export()))
    this.dirty = false
  }
}

async function createSqliteStore(filePath) {
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(path.dirname(require.resolve('sql.js')), file),
  })
  const database = fs.existsSync(filePath) ? new SQL.Database(new Uint8Array(fs.readFileSync(filePath))) : new SQL.Database()
  return new SqliteStore(database, filePath)
}

module.exports = { createSqliteStore }
