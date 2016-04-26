'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var SpatialUtil = {

  spatialTypeRegex: /^(\w+)(?:\((\w+), (\d+)\))?$/,

  /**
   * Get the version of the installed postgis extension
   */
  getPostgisVersion: function getPostgisVersion(cxn) {
    return cxn.knex.raw('select postgis_lib_version()').then(function (_ref) {
      var _ref$rows = _slicedToArray(_ref.rows, 1);

      var version = _ref$rows[0].version;

      return version.split('.');
    });
  },

  /**
   * Parse and validate the installed postgis version
   * (must be newer than 2.1)
   */
  validatePostgisVersion: function validatePostgisVersion(_ref2) {
    var _ref22 = _slicedToArray(_ref2, 3);

    var major = _ref22[0];
    var minor = _ref22[1];
    var patch = _ref22[2];

    if (major < 2 || major == 2 && minor < 1) {
      throw new Error('\n        PostGIS ' + major + '.' + minor + '.' + patch + ' detected. This adapter requires PostGIS 2.1 or higher.\n        Please either:\n        1. Upgrade your PostGIS extension to at least 2.1.0\n        2. Disable the spatial extension on this adapter (see README)\n      ');
    }

    return parseFloat(major + '.' + minor);
  },

  /*
  addGeometryColumns (cxn, tableName, tableDefinition) {
    let geometryColumns = _.chain(tableDefinition)
      .pick(SpatialUtil.isSpatialColumn)
      .map((attr, name) => {
        return SpatialUtil.addGeometryColumn(cxn, tableName, name, attr)
      })
      .value()
     return Promise.all(geometryColumns)
  },
  */

  /**
   * Add a geometry column to a table
   * http://postgis.net/docs/AddGeometryColumn.html
  addGeometryColumn (cxn, tableName, attributeName, definition) {
    let columnName = attributeName || definition.columnName
    let srid = definition.srid || 4326
     return cxn.knex.raw(`
      select AddGeometryColumn('${tableName}', '${columnName}', ${srid}, 'GEOMETRY', 2)
    `)
  },
   */

  /**
   * Convert geojson into postgis 'geometry' type. Re-project geometry if necessary.
   *
   * http://postgis.net/docs/ST_GeomFromGeoJSON.html
   * http://postgis.org/docs/ST_Transform.html
   */
  fromGeojson: function fromGeojson(geojson, definition, cxn) {
    if (_lodash2['default'].isEmpty(geojson)) return;

    var obj = _lodash2['default'].isString(geojson) ? JSON.parse(geojson) : geojson;
    var geometry = obj.geometry || obj;

    _lodash2['default'].defaultsDeep(geometry, {
      crs: {
        type: 'name',
        properties: {
          name: 'EPSG:' + SpatialUtil.getDeclaredSrid(geometry, definition)
        }
      }
    });

    return cxn.st.transform(cxn.st.geomFromGeoJSON(geometry), SpatialUtil.getNativeSrid(definition));
  },

  /**
   * Get "declared srid". This is the SRID that we're expecting of geometries
   * that we're inserting into the database.
   */
  getDeclaredSrid: function getDeclaredSrid(geometry, definition) {
    var _split = (_lodash2['default'].get(geometry, ['crs', 'properties', 'name']) || '').split(':');

    var _split2 = _slicedToArray(_split, 2);

    var $ = _split2[0];
    var declaredSrid = _split2[1];

    return declaredSrid || SpatialUtil.getNativeSrid(definition);
  },

  /**
   * Get "native srid". This is the SRID that we're using to store geometries
   * in the database.
   *
   * examples:
   *  geometry(Point, 4326)
   */
  getNativeSrid: function getNativeSrid(definition) {
    var _SpatialUtil$spatialTypeRegex$exec = SpatialUtil.spatialTypeRegex.exec(definition.dbType);

    var _SpatialUtil$spatialTypeRegex$exec2 = _slicedToArray(_SpatialUtil$spatialTypeRegex$exec, 4);

    var $ = _SpatialUtil$spatialTypeRegex$exec2[0];
    var dbType = _SpatialUtil$spatialTypeRegex$exec2[1];
    var geoType = _SpatialUtil$spatialTypeRegex$exec2[2];
    var srid = _SpatialUtil$spatialTypeRegex$exec2[3];

    return srid || 0;
  },

  buildSpatialSelect: function buildSpatialSelect(tableDefinition, tableName, cxn) {
    return _lodash2['default'].map(SpatialUtil.getSpatialColumns(tableDefinition), function (definition, attr) {
      return cxn.st.asGeoJSON(tableName + '.' + attr).as(attr);
    });
  },

  getSpatialColumns: function getSpatialColumns(tableDefinition) {
    return _lodash2['default'].pickBy(tableDefinition, SpatialUtil.isSpatialColumn);
  },

  hasSpatialColumn: function hasSpatialColumn(tableDefinition) {
    return !!_lodash2['default'].find(tableDefinition, SpatialUtil.isSpatialColumn);
  },

  isSpatialColumn: function isSpatialColumn(definition) {
    if (!definition || !definition.dbType) return false;

    var _ref3 = SpatialUtil.spatialTypeRegex.exec(definition.dbType) || [];

    var _ref32 = _slicedToArray(_ref3, 4);

    var $ = _ref32[0];
    var dbType = _ref32[1];
    var geoType = _ref32[2];
    var srid = _ref32[3];

    return dbType === 'geometry';
  }
};

exports['default'] = SpatialUtil;
module.exports = exports['default'];