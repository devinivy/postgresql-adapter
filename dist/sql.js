"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var SQL = {

  indexes: "\n    select\n      attname as column_name,\n      indisprimary as primary_key,\n      indisunique as unique,\n      true as indexed\n\n    from\n      pg_index\n\n    inner join pg_attribute\n      on (pg_attribute.attnum = any (pg_index.indkey) and pg_attribute.attrelid = pg_index.indrelid)\n    inner join pg_class\n      on (pg_class.oid = pg_index.indrelid)\n\n    where\n      pg_class.relname = ?\n  ",

  storedProcedures: "\n    select n.nspname as schema,\n      p.proname as name,\n      pg_catalog.pg_get_function_result(p.oid) as returntype,\n      pg_catalog.pg_get_function_arguments(p.oid) as signature\n\n    from pg_catalog.pg_proc p\n\n    left join pg_catalog.pg_namespace n on n.oid = p.pronamespace\n\n    where\n      pg_catalog.pg_function_is_visible(p.oid)\n      and n.nspname not in ('pg_catalog', 'information_schema')\n      and p.proname not like '\\_%'\n    order by schema, name\n  "
};

exports["default"] = SQL;
module.exports = exports["default"];