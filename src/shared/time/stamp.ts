/** Stored timestamps are UTC written as `YYYY-MM-DD HH:MM:SS` (server
 *  `timestamp()`, SQLite `datetime('now')`), with no zone: `new Date()` would
 *  read them as local time. A string with its own zone is read as it is. */
export function parseStamp(value: string): Date {
  const plain = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value);
  return new Date(plain ? `${value.replace(" ", "T")}Z` : value);
}
