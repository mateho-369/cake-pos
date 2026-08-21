const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

class BetterSqliteStore {
  constructor(database) {
    this.database = database
  }

  // Keep the store surface used by db.js/server.js while delegating directly
  // to better-sqlite3's synchronous native statements.
  prepare(sql) {
    return this.database.prepare(sql)
  }

  exec(sql) {
    return this.database.exec(sql)
  }

  pragma(statement, options) {
    return this.database.pragma(statement, options)
  }

  // better-sqlite3 returns a transaction function. The existing route layer
  // calls db.transaction(callback) directly, so execute it here immediately.
  transaction(callback) {
    return this.database.transaction(callback)()
  }

  close() {
    return this.database.close()
  }
}

async function createSqliteStore(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const database = new Database(filePath)
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = NORMAL')
  database.pragma('foreign_keys = ON')
  return new BetterSqliteStore(database)
}

module.exports = { createSqliteStore }
