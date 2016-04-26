'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _sql = require('./sql');

var _sql2 = _interopRequireDefault(_sql);

var Procedures = {

  /**
   * Return a collection of all stored procedures accessible to the current
   * database connection
   */
  describeAll: function describeAll(cxn) {
    var sp = cxn.knex.raw(_sql2['default'].storedProcedures);

    return sp.then(function (_ref) {
      var rows = _ref.rows;

      var procedures = _lodash2['default'].map(rows, function (row) {
        return Procedures.buildStoredProcedure(row, cxn);
      });

      procedures.push(Procedures.buildStoredProcedure({ name: 'version' }, cxn));

      return _lodash2['default'].isEmpty(procedures) ? {} : _lodash2['default'].keyBy(procedures, 'name');
    });
  },

  /**
   * Build a function that invokes the SP with the required arguments
   */
  buildStoredProcedure: function buildStoredProcedure(_ref2, cxn) {
    var schema = _ref2.schema;
    var name = _ref2.name;
    var returntype = _ref2.returntype;
    var signature = _ref2.signature;

    var argTemplate = Procedures.buildArgumentTemplate(signature);
    var fullName = !schema || schema == 'public' ? name : schema + '.' + name;

    return {
      name: fullName,
      signature: Procedures.parseSignature(signature),
      invoke: function invoke(args) {
        if (!schema) {
          return cxn.knex.raw('select ' + name + '(' + argTemplate + ')', args);
        } else {
          return cxn.knex.raw('select ' + schema + '.' + name + '(' + argTemplate + ')', args);
        }
      }
    };
  },

  buildArgumentTemplate: function buildArgumentTemplate(signature) {
    if (!signature) return '';

    var args = signature.split(', ');
    return args.map(function (arg) {
      return '?';
    }).join(',');
  },

  parseSignature: function parseSignature() {
    var signature = arguments.length <= 0 || arguments[0] === undefined ? '' : arguments[0];

    var parameters = signature.split(', ');
    return _lodash2['default'].map(parameters, function (param) {
      return param.split(' ')[0];
    });
  }
};

exports.Procedures = Procedures;
exports['default'] = Procedures;