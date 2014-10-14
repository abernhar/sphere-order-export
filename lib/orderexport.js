/* ===========================================================
# sphere-order-export - v0.18.0
# ==============================================================
# Copyright (c) 2014 Hajo Eichler
# Licensed under the MIT license.
*/
var BASE64, CHANNEL_KEY, CHANNEL_ROLE, CONTAINER_PAYMENT, CsvMapping, ElasticIo, OrderExport, Promise, SphereClient, XmlMapping, fs, _;

_ = require('underscore');

_.mixin(require('underscore-mixins'));

Promise = require('bluebird');

fs = Promise.promisifyAll(require('fs'));

SphereClient = require('sphere-node-sdk').SphereClient;

ElasticIo = require('sphere-node-utils').ElasticIo;

XmlMapping = require('./mapping-utils/xml');

CsvMapping = require('./mapping-utils/csv');

BASE64 = 'base64';

CHANNEL_KEY = 'OrderXmlFileExport';

CHANNEL_ROLE = 'OrderExport';

CONTAINER_PAYMENT = 'checkoutInfo';

OrderExport = (function() {
  function OrderExport(options) {
    if (options == null) {
      options = {};
    }
    this._exportOptions = _.defaults(options["export"] || {}, {
      fetchHours: 48,
      standardShippingMethod: 'None',
      exportType: 'xml',
      exportUnsyncedOnly: true
    });
    this.client = new SphereClient(options.client);
    this.xmlMapping = new XmlMapping(this._exportOptions);
    this.csvMapping = new CsvMapping(this._exportOptions);
  }

  OrderExport.prototype.elasticio = function(msg, cfg, next, snapshot) {
    if (_.isEmpty(msg || _.isEmpty(msg.body))) {
      ElasticIo.returnSuccess('No data from elastic.io!', next);
      return;
    }
    return this.client.channels.ensure(CHANNEL_KEY, CHANNEL_ROLE).then((function(_this) {
      return function(result) {
        _this.channel = result.body;
        return _this.xmlExport(_this._unsyncedOnly(msg.body.results, _this.channel));
      };
    })(this)).then((function(_this) {
      return function(xmlOrders) {
        var base64, content, data, fileName, now, syncInfos, xmlOrder, _i, _len;
        now = new Buffer(new Date().toISOString()).toString(BASE64);
        data = {
          body: {},
          attachments: {
            'touch-timestamp.txt': {
              content: now
            }
          }
        };
        syncInfos = [];
        for (_i = 0, _len = xmlOrders.length; _i < _len; _i++) {
          xmlOrder = xmlOrders[_i];
          content = xmlOrder.xml.end({
            pretty: true,
            indent: '  ',
            newline: "\n"
          });
          fileName = "" + xmlOrder.id + ".xml";
          base64 = new Buffer(content).toString(BASE64);
          data.attachments[fileName] = {
            content: base64
          };
          syncInfos.push(_this.syncOrder(xmlOrder, fileName));
        }
        return Promise.all(syncInfos).then(function() {
          return ElasticIo.returnSuccess(data, next);
        });
      };
    })(this))["catch"](function(result) {
      return ElasticIo.returnFailure(res, res, next);
    });
  };

  OrderExport.prototype.run = function() {
    switch (this._exportOptions.exportType.toLowerCase()) {
      case 'csv':
        return this._fetchOrders().then((function(_this) {
          return function(orders) {
            return _this.csvExport(orders);
          };
        })(this));
      case 'xml':
        return this._fetchOrders().then((function(_this) {
          return function(orders) {
            return _this.xmlExport(orders);
          };
        })(this));
      default:
        return Promise.reject("Undefined export type '" + this._exportOptions.exportType + "', supported 'csv' or 'xml'");
    }
  };

  OrderExport.prototype.csvExport = function(orders) {
    if (!this._exportOptions.csvTemplate) {
      throw new Error('You need to provide a csv template for exporting order information');
    }
    return fs.readFileAsync(this._exportOptions.csvTemplate, {
      encoding: 'utf-8'
    }).then((function(_this) {
      return function(content) {
        return _this.csvMapping.mapOrders(content, orders);
      };
    })(this));
  };

  OrderExport.prototype.xmlExport = function(orders) {
    return Promise.map(orders, (function(_this) {
      return function(order) {
        return _this._processXmlOrder(order);
      };
    })(this));
  };

  OrderExport.prototype._fetchOrders = function() {
    return this.client.channels.ensure(CHANNEL_KEY, CHANNEL_ROLE).then((function(_this) {
      return function(result) {
        _this.channel = result.body;
        return _this.client.orders.all().expand('lineItems[*].state[*].state').expand('lineItems[*].supplyChannel').expand('customerGroup').last("" + _this._exportOptions.fetchHours + "h").fetch();
      };
    })(this)).then((function(_this) {
      return function(result) {
        var allOrders;
        allOrders = result.body.results;
        if (_this._exportOptions.exportUnsyncedOnly) {
          return Promise.resolve(_this._unsyncedOnly(allOrders, _this.channel));
        } else {
          return Promise.resolve(allOrders);
        }
      };
    })(this));
  };

  OrderExport.prototype._unsyncedOnly = function(orders, channel) {
    return _.filter(orders, function(order) {
      order.syncInfo || (order.syncInfo = []);
      if (_.isEmpty(order.syncInfo)) {
        return true;
      } else {
        return !_.find(order.syncInfo, function(syncInfo) {
          return syncInfo.channel.id === (channel != null ? channel.id : void 0);
        });
      }
    });
  };

  OrderExport.prototype._processXmlOrder = function(order) {
    return this.client.customObjects.byId("" + CONTAINER_PAYMENT + "/" + order.id).fetch().then((function(_this) {
      return function(result) {
        var entry, paymentInfo;
        paymentInfo = result.body;
        if (order.customerId != null) {
          return _this.client.customers.byId(order.customerId).fetch().then(function(result) {
            var entry;
            entry = {
              id: order.id,
              xml: _this.xmlMapping.mapOrder(order, paymentInfo, result.body),
              version: order.version
            };
            return Promise.resolve(entry);
          });
        } else {
          entry = {
            id: order.id,
            xml: _this.xmlMapping.mapOrder(order, paymentInfo),
            version: order.version
          };
          return Promise.resolve(entry);
        }
      };
    })(this));
  };

  OrderExport.prototype.syncOrder = function(xmlOrder, filename) {
    var data;
    data = {
      version: xmlOrder.version,
      actions: [
        {
          action: 'updateSyncInfo',
          channel: {
            typeId: 'channel',
            id: this.channel.id
          },
          externalId: filename
        }
      ]
    };
    return this.client.orders.byId(xmlOrder.id).update(data);
  };

  return OrderExport;

})();

module.exports = OrderExport;
