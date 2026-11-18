/** migrations/*.sql, bundled as text (the `rules` entry in wrangler.jsonc). */
declare module "*.sql" {
  const sql: string;
  export default sql;
}
