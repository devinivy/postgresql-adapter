'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _util = require('./util');

var _util2 = _interopRequireDefault(_util);

var Errors = {

  E_UNIQUE: function E_UNIQUE(pgError) {
    return {
      code: 'E_UNIQUE',
      message: pgError.message,
      invalidAttributes: [pgError.column]
    };
  },

  E_NOTNULL: function E_NOTNULL(pgError) {
    return {
      code: 'E_UNIQUE',
      message: pgError.message,
      invalidAttributes: [pgError.column]
    };
  },

  E_PGERROR: function E_PGERROR(pgError) {
    return pgError;
  }
};

var PostgresErrorMapping = {
  // uniqueness constraint violation
  '23505': Errors.E_UNIQUE,

  // null-constraint violation
  '22002': Errors.E_NOTNULL,
  '22004': Errors.E_NOTNULL,
  '23502': Errors.E_NOTNULL,
  '39004': Errors.E_NOTNULL

};

// todo finish mapping
var AdapterError = {
  wrap: function wrap(cb, txn, payload) {
    return function (pgError) {
      var errorWrapper = PostgresErrorMapping[pgError.code];
      var error = pgError;

      if (_lodash2['default'].isFunction(errorWrapper)) {
        error = errorWrapper(pgError);
      }

      console.error(error);
      if (_util2['default'].isTransaction(txn)) {
        return txn.rollback().then(AdapterError.wrap(cb));
      }

      _lodash2['default'].isFunction(cb) && cb(error);
    };
  }
};

exports['default'] = AdapterError;
module.exports = exports['default'];