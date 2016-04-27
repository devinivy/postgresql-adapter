'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

var _knex = require('knex');

var _knex2 = _interopRequireDefault(_knex);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _camelize = require('camelize');

var _camelize2 = _interopRequireDefault(_camelize);

var _waterlineSequel = require('waterline-sequel');

var _waterlineSequel2 = _interopRequireDefault(_waterlineSequel);

var _knexPostgis = require('knex-postgis');

var _knexPostgis2 = _interopRequireDefault(_knexPostgis);

var _waterlineErrors = require('waterline-errors');

var _waterlineErrors2 = _interopRequireDefault(_waterlineErrors);

var _error = require('./error');

var _error2 = _interopRequireDefault(_error);

var _util = require('./util');

var _util2 = _interopRequireDefault(_util);

var _spatial = require('./spatial');

var _spatial2 = _interopRequireDefault(_spatial);

var _sql = require('./sql');

var _sql2 = _interopRequireDefault(_sql);

var Adapter = {

  identity: 'waterline-postgresql',

  wlSqlOptions: {
    parameterized: true,
    caseSensitive: false,
    escapeCharacter: '"',
    wlNext: {
      caseSensitive: true
    },
    casting: true,
    canReturnValues: true,
    escapeInserts: true,
    declareDeleteAlias: false
  },

  /**
   * Local connections store
   */
  connections: new Map(),

  //pkFormat: 'string',
  syncable: true,

  /**
   * Adapter default configuration
   */
  defaults: {
    schema: true,
    debug: process.env.WL_DEBUG || false,

    connection: {
      host: 'localhost',
      user: 'postgres',
      password: 'postgres',
      database: 'postgres',
      port: 5432
    },

    pool: {
      min: 1,
      max: 16,
      ping: function ping(knex, cb) {
        return knex.query('SELECT 1', cb);
      },
      pingTimeout: 10 * 1000,
      syncInterval: 2 * 1000,
      idleTimeout: 30 * 1000,
      acquireTimeout: 300 * 1000
    }
  },

  /**
   * This method runs when a connection is initially registered
   * at server-start-time. This is the only required method.
   *
   * @param  {[type]}   connection [description]
   * @param  {[type]}   collection [description]
   * @param  {Function} cb         [description]
   * @return {[type]}              [description]
   */
  registerConnection: function registerConnection(connection, collections, cb) {
    if (!connection.identity) {
      return cb(_waterlineErrors2['default'].adapter.IdentityMissing);
    }
    if (Adapter.connections.get(connection.identity)) {
      return cb(_waterlineErrors2['default'].adapter.IdentityDuplicate);
    }

    _lodash2['default'].defaultsDeep(connection, Adapter.defaults);

    var knex = (0, _knex2['default'])({
      client: 'pg',
      connection: connection.url || connection.connection,
      pool: connection.pool,
      debug: process.env.WATERLINE_DEBUG_SQL || connection.debug
    });
    var cxn = {
      identity: connection.identity,
      schema: Adapter.buildSchema(connection, collections),
      collections: collections,
      config: connection,
      knex: knex,
      st: (0, _knexPostgis2['default'])(knex)
    };

    return _util2['default'].initializeConnection(cxn).then(function () {
      Adapter.connections.set(connection.identity, cxn);
      cb();
    })['catch'](cb);
  },

  /**
   * Construct the waterline schema for the given connection.
   *
   * @param connection
   * @param collections[]
   */
  buildSchema: function buildSchema(connection, collections) {
    return _lodash2['default'].chain(collections).map(function (model, modelName) {
      var definition = _lodash2['default'].get(model, ['waterline', 'schema', model.identity]);
      return _lodash2['default'].defaultsDeep(definition, {
        attributes: {},
        tableName: modelName
      });
    }).keyBy('tableName').value();
  },

  /**
   * Return the version of the PostgreSQL server as an array
   * e.g. for Postgres 9.3.9, return [ '9', '3', '9' ]
   */
  getVersion: function getVersion(cxn) {
    return cxn.knex.raw('select version() as version').then(function (_ref) {
      var _ref$rows = _slicedToArray(_ref.rows, 1);

      var row = _ref$rows[0];

      return row.version.split(' ')[1].split('.');
    });
  },

  /**
   * Describe a table. List all columns and their properties.
   *
   * @param connectionName
   * @param tableName
   */
  describe: function describe(connectionName, tableName, cb) {
    var cxn = Adapter.connections.get(connectionName);

    return cxn.knex(tableName).columnInfo().then(function (columnInfo) {
      if (_lodash2['default'].isEmpty(columnInfo)) {
        return cb();
      }

      return Adapter._query(cxn, _sql2['default'].indexes, [tableName]).then(function (_ref2) {
        var rows = _ref2.rows;

        _lodash2['default'].merge(columnInfo, _lodash2['default'].keyBy((0, _camelize2['default'])(rows), 'columnName'));
        _lodash2['default'].isFunction(cb) && cb(null, columnInfo);
      });
    })['catch'](_error2['default'].wrap(cb));
  },

  /**
   * Perform a direct SQL query on the database
   *
   * @param connectionName
   * @param tableName
   * @param queryString
   * @param data
   */
  query: function query(connectionName, tableName, queryString, args, cb) {
    var cxn = Adapter.connections.get(connectionName);

    return Adapter._query(cxn, queryString, args).then(function () {
      var result = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      _lodash2['default'].isFunction(cb) && cb(null, result);
      return result;
    })['catch'](_error2['default'].wrap(cb));
  },

  _query: function _query(cxn, query, values) {
    return cxn.knex.raw(_util2['default'].toKnexRawQuery(query), _util2['default'].castValues(values)).then(function () {
      var result = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];
      return result;
    });
  },

  /**
   * Create a new table
   *
   * @param connectionName
   * @param tableName
   * @param definition - the waterline schema definition for model
   * @param cb
   */
  define: function define(connectionName, _tableName, definition, cb) {
    var cxn = Adapter.connections.get(connectionName);
    var schema = cxn.collections[_tableName];
    var tableName = _tableName.substring(0, 63);

    return cxn.knex.schema.hasTable(tableName).then(function (exists) {
      if (exists) return;

      return cxn.knex.schema.createTable(tableName, function (table) {
        _lodash2['default'].each(definition, function (definition, attributeName) {
          var newColumn = _util2['default'].toKnexColumn(table, attributeName, definition, schema, cxn.collections);
          _util2['default'].applyColumnConstraints(newColumn, definition);
        });
        _util2['default'].applyTableConstraints(table, definition);
      });
    }).then(function () {
      //console.log('created table', tableName, schema)
      _lodash2['default'].isFunction(cb) && cb();
    })['catch'](_error2['default'].wrap(cb));
  },

  /**
   * Drop a table
   */
  drop: function drop(connectionName, tableName) {
    var relations = arguments.length <= 2 || arguments[2] === undefined ? [] : arguments[2];
    var cb = arguments.length <= 3 || arguments[3] === undefined ? relations : arguments[3];
    return (function () {
      var cxn = Adapter.connections.get(connectionName);

      return cxn.knex.schema.dropTableIfExists(tableName).then(function () {
        return Promise.all(_lodash2['default'].map(relations, function (relation) {
          return cxn.knex.schema.dropTableIfExists(relation);
        }));
      }).then(function () {
        _lodash2['default'].isFunction(cb) && cb();
      })['catch'](_error2['default'].wrap(cb));
    })();
  },

  /**
   * Add a column to a table
   */
  addAttribute: function addAttribute(connectionName, tableName, attributeName, definition, cb) {
    var cxn = Adapter.connections.get(connectionName);
    var schema = cxn.collections[tableName];

    return cxn.knex.schema.table(tableName, function (table) {
      var newColumn = _util2['default'].toKnexColumn(table, attributeName, definition, schema, cxn.collections);
      _util2['default'].applyColumnConstraints(newColumn, definition);
    }).then(function () {
      _lodash2['default'].isFunction(cb) && cb();
    })['catch'](_error2['default'].wrap(cb));
  },

  /**
   * Remove a column from a table
   */
  removeAttribute: function removeAttribute(connectionName, tableName, attributeName, cb) {
    var cxn = Adapter.connections.get(connectionName);

    return cxn.knex.schema.table(tableName, function (table) {
      table.dropColumn(attributeName);
    }).then(function (result) {
      _lodash2['default'].isFunction(cb) && cb(null, result);
      return result;
    })['catch'](_error2['default'].wrap(cb));
  },

  /**
   * Create a new record
   */
  create: function create(connectionName, tableName, data, cb) {
    var cxn = Adapter.connections.get(connectionName);
    var insertData = _util2['default'].sanitize(data, cxn.collections[tableName], cxn);
    var schema = cxn.collections[tableName];
    var spatialColumns = _spatial2['default'].buildSpatialSelect(schema.definition, tableName, cxn);

    return cxn.knex(tableName).insert(insertData).returning(['*'].concat(_toConsumableArray(spatialColumns))).then(function (rows) {
      var casted = _util2['default'].castResultRows(rows, schema);
      var result = _lodash2['default'].isArray(data) ? casted : casted[0];

      _lodash2['default'].isFunction(cb) && cb(null, result);
      return result;
    })['catch'](_error2['default'].wrap(cb, null, data));
  },

  /**
   * Create multiple records
   */
  createEach: function createEach(connectionName, tableName, records, cb) {
    // TODO use knex.batchInsert
    return Adapter.create(connectionName, tableName, records, cb);
  },

  /**
   * Update a record
   */
  update: function update(connectionName, tableName, options, data, cb) {
    var cxn = Adapter.connections.get(connectionName);
    var schema = cxn.collections[tableName];
    var wlsql = new _waterlineSequel2['default'](cxn.schema, Adapter.wlSqlOptions);
    var spatialColumns = _spatial2['default'].getSpatialColumns(schema.definition);
    var updateData = _lodash2['default'].omit(data, _lodash2['default'].keys(spatialColumns));

    return new Promise(function (resolve, reject) {
      if (_lodash2['default'].isEmpty(data)) {
        return Adapter.find(connectionName, tableName, options, cb);
      }
      resolve(wlsql.update(tableName, options, updateData));
    }).then(function (_ref3) {
      var query = _ref3.query;
      var values = _ref3.values;

      return Adapter._query(cxn, query, values);
    }).then(function (_ref4) {
      var rows = _ref4.rows;

      cb && cb(null, rows);
    })['catch'](_error2['default'].wrap(cb, null, data));
  },

  /**
   * Destroy a record
   */
  destroy: function destroy(connectionName, tableName, options, cb) {
    var cxn = Adapter.connections.get(connectionName);
    var wlsql = new _waterlineSequel2['default'](cxn.schema, Adapter.wlSqlOptions);

    return new Promise(function (resolve, reject) {
      resolve(wlsql.destroy(tableName, options));
    }).then(function (_ref5) {
      var query = _ref5.query;
      var values = _ref5.values;

      return Adapter._query(cxn, query, values);
    }).then(function (_ref6) {
      var rows = _ref6.rows;

      cb(null, rows);
    })['catch'](_error2['default'].wrap(cb));
  },

  /**
   * Populate record associations
   */
  join: function join(connectionName, tableName, options, cb) {
    var cxn = Adapter.connections.get(connectionName);
    var schema = cxn.collections[tableName];

    return _util2['default'].buildKnexJoinQuery(cxn, tableName, options).then(function (result) {
      // return unique records only.
      // TODO move to SQL
      _lodash2['default'].each(_lodash2['default'].reject(options.joins, { select: false }), function (join) {
        var alias = _util2['default'].getJoinAlias(join);
        var pk = Adapter.getPrimaryKey(cxn, join.child);
        var schema = cxn.collections[join.child];

        _lodash2['default'].each(result, function (row) {
          row[alias] = _util2['default'].castResultRows(_lodash2['default'].compact(_lodash2['default'].uniqBy(row[alias], pk)), schema);
        });
      });

      return result;
    }).then(function (result) {
      result = _util2['default'].castResultRows(result, schema);
      _lodash2['default'].isFunction(cb) && cb(null, result);
      return result;
    })['catch'](_error2['default'].wrap(cb));
  },

  /**
   * Get the primary key column of a table
   */
  getPrimaryKey: function getPrimaryKey(_ref7, tableName) {
    var collections = _ref7.collections;

    var definition = collections[tableName].definition;

    if (!definition._pk) {
      var pk = _lodash2['default'].findKey(definition, function (attr, name) {
        return attr.primaryKey === true;
      });
      definition._pk = pk || 'id';
    }

    return definition._pk;
  },

  /**
   * Find records
   */
  find: function find(connectionName, tableName, options, cb) {
    var cxn = Adapter.connections.get(connectionName);
    var wlsql = new _waterlineSequel2['default'](cxn.schema, Adapter.wlSqlOptions);
    var schema = cxn.collections[tableName];

    //console.log('find', tableName, options)
    //console.log('schema types', schema._types)

    return new Promise(function (resolve, reject) {
      resolve(wlsql.find(tableName, options));
    }).then(function (_ref8) {
      var _ref8$query = _slicedToArray(_ref8.query, 1);

      var query = _ref8$query[0];

      var _ref8$values = _slicedToArray(_ref8.values, 1);

      var values = _ref8$values[0];

      var spatialColumns = _spatial2['default'].buildSpatialSelect(schema.definition, tableName, cxn);
      var fullQuery = _util2['default'].addSelectColumns(spatialColumns, query);

      //console.log('fullQuery', fullQuery)
      //console.log('values', values)

      return Adapter._query(cxn, fullQuery, values);
    }).then(function (_ref9) {
      var rows = _ref9.rows;

      var result = _util2['default'].castResultRows(rows, schema);
      _lodash2['default'].isFunction(cb) && cb(null, result);
      return result;
    })['catch'](_error2['default'].wrap(cb));
  },

  /**
   * Count the number of records
   */
  count: function count(connectionName, tableName, options, cb) {
    var cxn = Adapter.connections.get(connectionName);
    var wlsql = new _waterlineSequel2['default'](cxn.schema, Adapter.wlSqlOptions);

    return new Promise(function (resolve, reject) {
      resolve(wlsql.count(tableName, options));
    }).then(function (_ref10) {
      var _ref10$query = _slicedToArray(_ref10.query, 1);

      var query = _ref10$query[0];

      var _ref10$values = _slicedToArray(_ref10.values, 1);

      var values = _ref10$values[0];

      return Adapter._query(cxn, query, values);
    }).then(function (_ref11) {
      var _ref11$rows = _slicedToArray(_ref11.rows, 1);

      var row = _ref11$rows[0];

      var count = Number(row.count);
      _lodash2['default'].isFunction(cb) && cb(null, count);
      return count;
    })['catch'](_error2['default'].wrap(cb));
  },

  /**
   * Run queries inside of a transaction.
   *
   * Model.transaction(txn => {
   *   Model.create({ ... }, txn)
   *     .then(newModel => {
   *       return Model.update(..., txn)
   *     })
   *   })
   *   .then(txn.commit)
   *   .catch(txn.rollback)
   */
  transaction: function transaction(connectionName, tableName, cb) {
    var cxn = Adapter.connections.get(connectionName);

    return new Promise(function (resolve) {
      cxn.knex.transaction(function (txn) {
        _lodash2['default'].isFunction(cb) && cb(null, txn);
        resolve(txn);
      });
    });
  },

  /**
   * Invoke a database function, aka "stored procedure"
   *
   * @param connectionName
   * @param tableName
   * @param procedureName the name of the stored procedure to invoke
   * @param args An array of arguments to pass to the stored procedure
   */
  procedure: function procedure(connectionName, procedureName) {
    var args = arguments.length <= 2 || arguments[2] === undefined ? [] : arguments[2];
    var cb = arguments.length <= 3 || arguments[3] === undefined ? args : arguments[3];
    return (function () {
      var cxn = Adapter.connections.get(connectionName);
      var procedure = cxn.storedProcedures[procedureName.toLowerCase()];

      if (!procedure) {
        var error = new Error('No stored procedure found with the name ' + procedureName);
        return _lodash2['default'].isFunction(cb) ? cb(error) : Promise.reject(error);
      }

      return procedure.invoke(args).then(function (result) {
        _lodash2['default'].isFunction(cb) && cb(null, result);
        return result;
      })['catch'](_error2['default'].wrap(cb));
    })();
  },

  /**
   * Stream query results
   *
   * TODO not tested
   */
  stream: function stream(connectionName, tableName, options, outputStream) {
    var cxn = Adapter.connections.get(connectionName);
    var wlsql = new _waterlineSequel2['default'](cxn.schema, Adapter.wlSqlOptions);

    return new Promise(function (resolve, reject) {
      resolve(wlsql.find(tableName, options));
    }).then(function (_ref12) {
      var _ref12$query = _slicedToArray(_ref12.query, 1);

      var query = _ref12$query[0];

      var _ref12$values = _slicedToArray(_ref12.values, 1);

      var values = _ref12$values[0];

      var resultStream = cxn.knex.raw(query, values);
      resultStream.pipe(outputStream);

      return new Promise(function (resolve, reject) {
        resultStream.on('end', resolve);
      });
    })['catch'](_error2['default'].wrap(cb));
  },

  /**
   * Fired when a model is unregistered, typically when the server
   * is killed. Useful for tearing-down remaining open connections,
   * etc.
   *
   * @param  {Function} cb [description]
   * @return {[type]}      [description]
   */
  teardown: function teardown(conn) {
    var cb = arguments.length <= 1 || arguments[1] === undefined ? conn : arguments[1];
    return (function () {
      var connections = conn ? [Adapter.connections.get(conn)] : Adapter.connections.values();
      var teardownPromises = [];

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = connections[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var cxn = _step.value;

          if (!cxn) continue;

          teardownPromises.push(cxn.knex.destroy());
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator['return']) {
            _iterator['return']();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return Promise.all(teardownPromises).then(function () {
        // only delete connection references after all open sessions are closed
        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
          for (var _iterator2 = connections[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
            var cxn = _step2.value;

            if (!cxn) continue;
            Adapter.connections['delete'](cxn.identity);
          }
        } catch (err) {
          _didIteratorError2 = true;
          _iteratorError2 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion2 && _iterator2['return']) {
              _iterator2['return']();
            }
          } finally {
            if (_didIteratorError2) {
              throw _iteratorError2;
            }
          }
        }

        cb();
      })['catch'](cb);
    })();
  },

  /**
   * Return the knex object
   *
   * @param connectionName
   */
  knex: function knex(connectionName) {
    var cnx = Adapter.connections.get(connectionName);
    if (cnx) {
      return cnx.knex;
    }
  }
};
exports['default'] = Adapter;
module.exports = exports['default'];