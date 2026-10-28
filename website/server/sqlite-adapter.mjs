// The local/test adapter implements D1's atomic batch contract as a transaction.
export function sqliteD1(sqlite) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          const args = values.map((v) => v instanceof ArrayBuffer ? new Uint8Array(v) : v);
          return {
            sql, args,
            async first() { return sqlite.prepare(sql).get(...args) || null; },
            async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(({ sql, args }) => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
}
