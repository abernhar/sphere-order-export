/* ===========================================================
# sphere-order-export - v0.17.6
# ==============================================================
# Copyright (c) 2014 Hajo Eichler
# Licensed under the MIT license.
*/
var CsvMapping, ElasticIo, OrderExport, OrderService, Q, SphereClient, XmlMapping, fs, _, _ref, _u;

_ = require('underscore');

Q = require('q');

fs = require('q-io/fs');

SphereClient = require('sphere-node-client');

_ref = require('sphere-node-utils'), ElasticIo = _ref.ElasticIo, _u = _ref._u;

OrderService = require('../lib/orderservice');

XmlMapping = require('./xmlmapping');

CsvMapping = require('./csvmapping');

OrderExport = (function() {
  var BASE64, CHANNEL_KEY, CHANNEL_ROLE, CONTAINER_PAYMENT;

  BASE64 = 'base64';

  CHANNEL_KEY = 'OrderXmlFileExport';

  CHANNEL_ROLE = 'OrderExport';

  CONTAINER_PAYMENT = 'checkoutInfo';

  function OrderExport(options) {
    if (options == null) {
      options = {};
    }
    this.client = new SphereClient(options);
    this.orderService = new OrderService(this.client);
    this.xmlMapping = new XmlMapping(options);
    this.csvMapping = new CsvMapping(options);
  }

  OrderExport.prototype.elasticio = function(msg, cfg, next, snapshot) {
    if (_.isEmpty(msg || _.isEmpty(msg.body))) {
      ElasticIo.returnSuccess('No data from elastic.io!', next);
      return;
    }
    return this.processOrders(msg.body.results).then((function(_this) {
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
        return Q.all(syncInfos).then(function() {
          return ElasticIo.returnSuccess(data, next);
        });
      };
    })(this)).fail(function(result) {
      return ElasticIo.returnFailure(res, res, next);
    });
  };

  OrderExport.prototype.processOrders = function(orders, csvTemplate) {
    if (csvTemplate != null) {
      return fs.read(csvTemplate).then((function(_this) {
        return function(content) {
          return _this.csvMapping.mapOrders(content, orders);
        };
      })(this));
    } else {
      return this.client.channels.ensure(CHANNEL_KEY, CHANNEL_ROLE).then((function(_this) {
        return function(result) {
          var unsyncedOrders;
          _this.channel = result.body;
          unsyncedOrders = _this.orderService.unsyncedOrders(orders, _this.channel);
          return Q.all(_.map(unsyncedOrders, function(order) {
            return _this.processOrder(order);
          }));
        };
      })(this));
    }
  };

  OrderExport.prototype.processOrder = function(order) {
    var deferred;
    deferred = Q.defer();
    this.client.customObjects.byId("" + CONTAINER_PAYMENT + "/" + order.id).fetch().then((function(_this) {
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
            return deferred.resolve(entry);
          });
        } else {
          entry = {
            id: order.id,
            xml: _this.xmlMapping.mapOrder(order, paymentInfo),
            version: order.version
          };
          return deferred.resolve(entry);
        }
      };
    })(this)).fail(function(err) {
      return deferred.reject(err);
    });
    return deferred.promise;
  };

  OrderExport.prototype.syncOrder = function(xmlOrder, filename) {
    return this.orderService.addSyncInfo(xmlOrder.id, xmlOrder.version, this.channel, filename);
  };

  return OrderExport;

})();

module.exports = OrderExport;
