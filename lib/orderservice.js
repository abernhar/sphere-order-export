/* ===========================================================
# sphere-order-export - v0.17.6
# ==============================================================
# Copyright (c) 2014 Hajo Eichler
# Licensed under the MIT license.
*/
var OrderService, Q, _;

Q = require('q');

_ = require('underscore');

OrderService = (function() {
  function OrderService(client) {
    this.client = client;
  }


  /*
  Returns only orders which haven't been synced using the given channel.
  @param {Collection} orders List of order resources.
  @param {Channel} channel SyncInfo channel to which an order mustn't have.
  @return {Collection}
   */

  OrderService.prototype.unsyncedOrders = function(orders, channel) {
    return _.select(orders, function(order) {
      order.syncInfo || (order.syncInfo = []);
      return !_.find(order.syncInfo, function(syncInfo) {
        return syncInfo.channel.id === (channel != null ? channel.id : void 0);
      });
    });
  };


  /*
  Add a SyncInfo to a given order.
  @param {String} orderId Id of order to be updated.
  @param {Channel} orderVersion Order resource version to update.
  @param {Channel} channel Channel which used for syncing.
  @param {String} externalId Id of external order resource (filename)
  @return {Promise Result}
   */

  OrderService.prototype.addSyncInfo = function(orderId, orderVersion, channel, externalId) {
    var data;
    data = {
      version: orderVersion,
      actions: [
        {
          action: 'updateSyncInfo',
          channel: {
            typeId: 'channel',
            id: channel.id
          },
          externalId: externalId
        }
      ]
    };
    return this.client.orders.byId(orderId).save(data);
  };

  return OrderService;

})();

module.exports = OrderService;
