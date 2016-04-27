'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _adapter = require('./adapter');

var _adapter2 = _interopRequireDefault(_adapter);

var _waterlineSequelSequelLibCriteriaProcessor = require('waterline-sequel/sequel/lib/criteriaProcessor');

var _waterlineSequelSequelLibCriteriaProcessor2 = _interopRequireDefault(_waterlineSequelSequelLibCriteriaProcessor);

var _spatial = require('./spatial');

var _spatial2 = _interopRequireDefault(_spatial);

var _procedures = require('./procedures');

var _procedures2 = _interopRequireDefault(_procedures);

var _knex = require('knex');

var _knex2 = _interopRequireDefault(_knex);

var Util = {

  PG_MAX_INT: 2147483647,

  initializeConnection: function initializeConnection(cxn) {
    return _adapter2['default'].getVersion(cxn).then(function (version) {
      cxn.version = Util.validateVersion(version);

      return _procedures2['default'].describeAll(cxn);
    }).then(function (procedures) {
      cxn.storedProcedures = procedures;
    });
  },

  getTransaction: function getTransaction(txn, query) {
    if (Util.isTransaction(txn)) {
      return txn;
    } else {
      return query;
    }
  },

  isTransaction: function isTransaction(txn) {
    return txn && _lodash2['default'].isFunction(txn.commit);
  },

  /**
   * Apply a primary key constraint to a table
   *
   * @param table - a knex table object
   * @param definition - a waterline attribute definition
   */
  applyPrimaryKeyConstraints: function applyPrimaryKeyConstraints(table, definition) {
    var primaryKeys = _lodash2['default'].keys(_lodash2['default'].pickBy(definition, function (attribute) {
      return attribute.primaryKey;
    }));

    if (!primaryKeys.length) return;

    return table.primary(primaryKeys);
  },

  applyCompositeUniqueConstraints: function applyCompositeUniqueConstraints(table, definition) {
    _lodash2['default'].each(definition, function (attribute, name) {
      var uniqueDef = attribute.unique || {};
      if (attribute.primaryKey) return;
      if (_lodash2['default'].isEmpty(uniqueDef)) return;
      if (!_lodash2['default'].isArray(uniqueDef.composite)) return;

      var uniqueKeys = _lodash2['default'].uniq([name].concat(_toConsumableArray(uniqueDef.composite)));

      table.unique(uniqueKeys);
    });
  },

  applyEnumConstraints: function applyEnumConstraints(table, definition) {
    _lodash2['default'].each(definition, function (attribute, name) {
      if (_lodash2['default'].isArray(attribute['enum'])) {
        table.enu(name, attribute['enum']);
      }
    });
  },

  applyTableConstraints: function applyTableConstraints(table, definition) {
    return Promise.all([Util.applyPrimaryKeyConstraints(table, definition), Util.applyCompositeUniqueConstraints(table, definition)]);
  },

  //Util.applyEnumConstraints(table, definition)
  applyColumnConstraints: function applyColumnConstraints(column, definition) {
    if (_lodash2['default'].isString(definition)) {
      return;
    }
    return _lodash2['default'].map(definition, function (value, key) {
      if (key == 'defaultsTo' && definition.autoIncrement && value == 'AUTO_INCREMENT') {
        return;
      }

      return Util.applyParticularColumnConstraint(column, key, value, definition);
    });
  },

  /**
   * Apply value constraints to a particular column
   */
  applyParticularColumnConstraint: function applyParticularColumnConstraint(column, constraintName, value, definition) {
    if (!value) return;

    switch (constraintName) {

      case 'index':
        return column.index(_lodash2['default'].get(value, 'indexName'), _lodash2['default'].get(value, 'indexType'));

      /**
       * Acceptable forms:
       * attr: { unique: true }
       * attr: {
       *   unique: {
       *     unique: true, // or false
       *     composite: [ 'otherAttr' ]
       *   }
       * }
       */
      case 'unique':
        if ((value === true || _lodash2['default'].get(value, 'unique') === true) && !definition.primaryKey) {
          column.unique();
        }
        return;

      case 'notNull':
        return column.notNullable();

      case 'defaultsTo':
        if (_lodash2['default'].isArray(value) && definition.type == 'array') {
          return column.defaultTo('{' + value.join(',') + '}');
        }
        if (!_lodash2['default'].isFunction(value)) {
          return column.defaultTo(value);
        }

      /*
       * TODO
      case 'comment':
      return table.comment(attr.comment || attr.description)
      */

      case 'primaryKey':
      case 'autoIncrement':
        if (definition.dbType == 'uuid') {
          return column.defaultTo(_knex2['default'].raw('uuid_generate_v4()'));
        }
    }
  },

  /**
   * Create a column for Knex from a Waterline attribute definition
   */
  toKnexColumn: function toKnexColumn(table, _name, attrDefinition, wlModel, schema) {
    var attr = _lodash2['default'].isObject(attrDefinition) ? attrDefinition : { type: attrDefinition };
    var type = attr.autoIncrement ? 'serial' : attr.type;
    var name = attr.columnName || _name;

    if (_lodash2['default'].includes(wlModel.meta.uuids, _name) && !wlModel.meta.junctionTable) {
      wlModel._attributes[_name].type = 'uuid';
      wlModel.definition[_name].type = 'uuid';
      wlModel._cast._types[_name] = 'uuid';

      type = 'uuid';
    }

    if (attrDefinition.foreignKey && attrDefinition.model) {
      var refModel = schema[attrDefinition.model];
      try {
        var fpk = _adapter2['default'].getPrimaryKey({ collections: schema }, attrDefinition.model);
        if (_lodash2['default'].includes(refModel.meta.uuids, fpk) && !refModel.meta.junctionTable) {
          type = 'uuid';
        }
      } catch (e) {}
    }

    // set key types for m2m
    if (attrDefinition.foreignKey && attrDefinition.references && attrDefinition.on) {
      try {
        type = schema[attrDefinition.references].attributes[attrDefinition.on].type;
      } catch (e) {}
    }

    /**
     * Perform a special check for ENUM. ENUM is both a type and a constraint.
     *
     * table.enu(col, values)
     * Adds a enum column, (aliased to enu, as enum is a reserved word in javascript).
     */
    if (_lodash2['default'].isArray(attr['enum'])) {
      return table.enu(name, attr['enum']);
    }

    switch (attr.dbType || type.toLowerCase()) {
      /**
       * table.text(name, [textType])
       * Adds a text column, with optional textType for MySql text datatype preference.
       * textType may be mediumtext or longtext, otherwise defaults to text.
       */
      case 'string':
      case 'text':
      case 'mediumtext':
      case 'longtext':
        return table.text(name, type);

      /**
       * table.string(name, [length])
       * Adds a string column, with optional length defaulting to 255.
       */
      case 'character varying':
        return table.string(name, attr.length);

      case 'serial':
      case 'smallserial':
        return table.specificType(name, 'serial');
      case 'bigserial':
        return table.specificType(name, 'bigserial');

      /**
       * table.boolean(name)
       * Adds a boolean column.
       */
      case 'boolean':
        return table.boolean(name);

      /**
       * table.integer(name)
       * Adds an integer column.
       */
      case 'int':
      case 'integer':
      case 'smallint':
        return table.integer(name);

      /**
       * table.bigInteger(name)
       * In MySQL or PostgreSQL, adds a bigint column, otherwise adds a normal integer.
       * Note that bigint data is returned as a string in queries because JavaScript may
       * be unable to parse them without loss of precision.
       */
      case 'bigint':
      case 'biginteger':
        return table.bigInteger(name);

      /**
       * table.float(column, [precision], [scale])
       * Adds a float column, with optional precision and scale.
       */
      case 'real':
      case 'float':
        return table.float(name, attr.precision, attr.scale);

      case 'double':
        return table.float(name, 15, attr.scale);

      /**
       * table.decimal(column, [precision], [scale])
       * Adds a decimal column, with optional precision and scale.
       */
      case 'decimal':
        return table.decimal(name, attr.precision, attr.scale);

      /**
       * table.time(name)
       * Adds a time column.
       */
      case 'time':
        return table.time(name);

      /**
       * table.date(name)
       * Adds a date column.
       */
      case 'date':
        return table.date(name);

      /**
       * table.timestamp(name, [standard])
       * Adds a timestamp column, defaults to timestamptz in PostgreSQL,
       * unless true is passed as the second argument.
       *
       * Note that the method for defaulting to the current datetime varies from one
       * database to another. For example: PostreSQL requires .defaultTo(knex.raw('now()')),
       * but SQLite3 requires .defaultTo(knex.raw("date('now')")).
       */
      case 'datestamp':
      case 'datetime':
        return table.timestamp(name, attr.standard);

      case 'array':
        return table.specificType(name, 'text ARRAY');

      /**
       * table.json(name, [jsonb])
       * Adds a json column, using the built-in json type in postgresql,
       * defaulting to a text column in older versions of postgresql or in unsupported databases.
       * jsonb can be used by passing true as the second argument.
       */
      case 'json':
      case 'jsonb':
        return table.jsonb(name);

      case 'binary':
        return table.binary(name);

      /**
       * table.uuid(name)
       * Adds a uuid column - this uses the built-in uuid type in postgresql,
       * and falling back to a char(36) in other databases.
       */
      case 'uuid':
        return table.uuid(name);

      default:
        return table.specificType(name, attr.dbType || type);
    }
  },

  /**
   * Convert a parameterized waterline query into a knex-compatible query string
   */
  toKnexRawQuery: function toKnexRawQuery(sql) {
    var wlSqlOptions = _adapter2['default'].wlSqlOptions;

    sql = (sql || '').replace(/\$\d+/g, '?');
    if (_lodash2['default'].get(wlSqlOptions, 'wlNext.caseSensitive')) {
      sql = sql.replace(/LOWER\(("\w+"."\w+")\)/ig, '$1');
    }

    return sql;
  },

  /**
   * Cast values to the correct type
   */
  castValues: function castValues(values) {
    return _lodash2['default'].map(values, function (value) {
      if (_lodash2['default'].isString(value) && value[0] === '[') {
        var arr = JSON.parse(value);
        if (_lodash2['default'].isArray(arr)) {
          return arr;
        }
      }

      return value;
    });
  },

  castResultRows: function castResultRows(rows, schema) {
    if (_lodash2['default'].isPlainObject(rows)) {
      return Util.castResultValues(rows, schema);
    } else {
      return _lodash2['default'].map(rows, function (row) {
        return Util.castResultValues(row, schema);
      });
    }
  },

  castResultValues: function castResultValues(values, schema) {
    return _lodash2['default'].mapValues(values, function (value, attr) {
      var definition = schema.definition[attr];
      if (!definition) return value;

      if (_spatial2['default'].isSpatialColumn(definition)) {
        try {
          return JSON.parse(value);
        } catch (e) {
          return null;
        }
      }

      if (_lodash2['default'].isArray(value)) {
        return _lodash2['default'].map(value, function (item) {
          try {
            return JSON.parse(item);
          } catch (e) {
            return item;
          }
        });
      }

      return value;
    });
  },

  sanitize: function sanitize(data, schema, cxn) {
    if (_lodash2['default'].isArray(data)) {
      return _lodash2['default'].map(data, function (record) {
        return Util.sanitizeRecord(record, schema, cxn);
      });
    } else {
      return Util.sanitizeRecord(data, schema, cxn);
    }
  },

  sanitizeRecord: function sanitizeRecord(data, schema, cxn) {
    _lodash2['default'].each(data, function (value, attr) {
      var definition = schema.definition[attr];

      // remove unrecognized fields (according to schema) from data
      if (!definition) {
        delete data[attr];
        return;
      }

      // remove any autoIncrement fields from data
      if (!definition || definition.autoIncrement) {
        delete data[attr];
      }
      if (_spatial2['default'].isSpatialColumn(definition)) {
        data[attr] = _spatial2['default'].fromGeojson(data[attr], definition, cxn);
      }
    });

    return data;
  },

  /**
   * Construct a knex query that joins one or more tables for populate()
   */
  buildKnexJoinQuery: function buildKnexJoinQuery(cxn, tableName, options) {
    var schema = cxn.collections[tableName];
    var pk = _adapter2['default'].getPrimaryKey(cxn, tableName);

    var query = cxn.knex.select(tableName + '.*').select(_spatial2['default'].buildSpatialSelect(schema.definition, tableName, cxn)).select(cxn.knex.raw(Util.buildSelectAggregationColumns(cxn, options))).from(tableName).where(Util.buildWhereClause(cxn, tableName, options)).groupBy(tableName + '.' + pk).orderByRaw(Util.buildOrderByClause(tableName, options)).limit(options.limit || Util.PG_MAX_INT).offset(options.skip || 0);

    Util.buildKnexJoins(cxn, options, query);

    return query;
  },

  addSelectColumns: function addSelectColumns(columns, query) {
    var _query$split = query.split('FROM');

    var _query$split2 = _slicedToArray(_query$split, 2);

    var oldSelectClause = _query$split2[0];
    var fromClause = _query$split2[1];

    var newSelectClause = [oldSelectClause.split(',')].concat(_toConsumableArray(columns)).join(',');

    return newSelectClause + ' FROM ' + fromClause;
  },

  buildKnexJoins: function buildKnexJoins(cxn, _ref, query) {
    var joins = _ref.joins;

    _lodash2['default'].each(joins, function (join) {
      var parentAlias = Util.getParentAlias(join);
      var alias = Util.getSubqueryAlias(join);
      var subquery = Util.buildKnexJoinSubquery(cxn, join);

      query.leftJoin(cxn.knex.raw('(' + subquery + ') as "' + alias + '"'), alias + '.' + join.childKey, parentAlias + '.' + join.parentKey);
    });
  },

  buildKnexJoinSubquery: function buildKnexJoinSubquery(cxn, _ref2) {
    var criteria = _ref2.criteria;
    var child = _ref2.child;

    var schema = cxn.collections[child];

    return cxn.knex.select('*').select(_spatial2['default'].buildSpatialSelect(schema.definition, child, cxn)).from(child).where(Util.buildWhereClause(cxn, child, criteria));
  },

  buildOrderByClause: function buildOrderByClause(tableName, _ref3) {
    var sort = _ref3.sort;

    if (_lodash2['default'].isEmpty(sort)) {
      return '1';
    }

    var queryTokens = _lodash2['default'].map(sort, function (_direction, field) {
      var direction = _direction === 1 ? '' : 'desc';
      return '"' + tableName + '"."' + field + '" ' + direction;
    });
    return queryTokens.join(', ');
  },

  buildWhereClause: function buildWhereClause(cxn, tableName, options) {
    var parser = new _waterlineSequelSequelLibCriteriaProcessor2['default'](tableName, cxn.schema, _adapter2['default'].wlSqlOptions);

    var _parser$read = parser.read(_lodash2['default'].omit(options, ['sort', 'limit', 'groupBy', 'skip']));

    var query = _parser$read.query;
    var values = _parser$read.values;

    return cxn.knex.raw(Util.toKnexRawQuery(query), Util.castValues(values));
  },

  getJoinAlias: function getJoinAlias(_ref4) {
    var alias = _ref4.alias;
    var parentKey = _ref4.parentKey;
    var removeParentKey = _ref4.removeParentKey;

    if (alias != parentKey && removeParentKey === true) {
      return parentKey;
    } else {
      return alias;
    }
  },

  getParentAlias: function getParentAlias(join) {
    if (join.junctionTable) {
      return Util.getJoinAlias(join) + join.parent;
    } else {
      return join.parent;
    }
  },

  getSubqueryAlias: function getSubqueryAlias(join) {
    return Util.getJoinAlias(join) + join.child;
  },

  buildSelectAggregationColumns: function buildSelectAggregationColumns(cxn, _ref5) {
    var joins = _ref5.joins;

    return _lodash2['default'].map(_lodash2['default'].reject(joins, { select: false }), function (join) {

      var criteria = join.criteria || {};
      var subqueryAlias = Util.getSubqueryAlias(join);
      var asColumn = Util.getJoinAlias(join);
      var orderBy = Util.buildOrderByClause(subqueryAlias, criteria);
      var start = (criteria.skip || 0) + 1;
      var end = (criteria.limit || Util.PG_MAX_INT - start) + start - 1;

      if (!criteria.skip && !criteria.limit) {
        return 'json_agg("' + subqueryAlias + '".* order by ' + orderBy + ') as "' + asColumn + '"';
      }

      return 'array_to_json((array_agg("' + subqueryAlias + '".* order by ' + orderBy + '))[' + start + ':' + end + ']) as "' + asColumn + '"';
    });
  },

  /**
   * Parse and validate a Postgres "select version()" result
   */
  validateVersion: function validateVersion(_ref6) {
    var _ref62 = _slicedToArray(_ref6, 3);

    var major = _ref62[0];
    var minor = _ref62[1];
    var patch = _ref62[2];

    if (major < 9 || major === 9 && minor < 4) {
      throw new Error('\n        PostgreSQL ' + major + '.' + minor + '.' + patch + ' detected. This adapter requires PostgreSQL 9.4 or higher.\n        Please either:\n        1. Upgrade your Postgres server to at least 9.4.0 -or-\n        2. Use the sails-postgresql adapter instead: https://www.npmjs.com/package/sails-postgresql\n      ');
    }

    return parseFloat(major + '.' + minor);
  }
};

exports['default'] = Util;
module.exports = exports['default'];