var Csv, CsvMapping, Promise, access, _;

_ = require('underscore');

Promise = require('bluebird');

Csv = require('csv');

access = require('safe-access');

CsvMapping = (function() {
  var COLUMNS_FOR_ALL_ROWS, formatChannel, formatCustomerGroup, formatImages, formatMoney, formatPrice, formatStates;

  function CsvMapping() {}

  COLUMNS_FOR_ALL_ROWS = ['id', 'orderNumber'];

  CsvMapping.prototype.mapOrders = function(template, orders) {
    return this._analyseTemplate(template).then((function(_this) {
      return function(_arg) {
        var data, header, mappings, rows;
        header = _arg[0], mappings = _arg[1];
        rows = _.map(orders, function(order) {
          return _this._mapOrder(order, mappings);
        });
        data = _.flatten(rows, true);
        return _this.toCSV(header, data);
      };
    })(this));
  };

  CsvMapping.prototype._mapOrder = function(order, mappings) {
    var rows;
    rows = [];
    rows.push(_.map(mappings, (function(_this) {
      return function(mapping) {
        return _this._getValue(order, mapping);
      };
    })(this)));
    if ((order.lineItems != null) && (this.hasLineItemHeader != null)) {
      _.each(order.lineItems, (function(_this) {
        return function(lineItem, index) {
          return rows.push(_.map(mappings, function(mapping) {
            var lineItemMapping;
            if (/lineItems/.test(mapping)) {
              lineItemMapping = [mapping[0].replace(/lineItems/, "lineItems[" + index + "]"), mapping[1]];
              return _this._getValue(order, lineItemMapping);
            } else if (_.contains(COLUMNS_FOR_ALL_ROWS, mapping[0])) {
              return _this._getValue(order, mapping);
            }
          }));
        };
      })(this));
    }
    return rows;
  };

  CsvMapping.prototype._getValue = function(order, mapping) {
    var value;
    value = access(order, mapping[0]);
    if (!value) {
      return '';
    }
    if (_.size(mapping) === 2 && _.isFunction(mapping[1])) {
      return mapping[1].call(void 0, value);
    } else {
      return value || '';
    }
  };

  CsvMapping.prototype._analyseTemplate = function(template) {
    return this.parse(template).then((function(_this) {
      return function(data) {
        var header, mappings;
        header = data[0];
        mappings = _.map(header, function(entry) {
          if (/lineItems/.test(entry)) {
            _this.hasLineItemHeader = true;
          }
          return _this._mapHeader(entry);
        });
        return Promise.resolve([header, mappings]);
      };
    })(this));
  };

  CsvMapping.prototype._mapHeader = function(entry) {
    switch (entry) {
      case 'totalNet':
      case 'totalGross':
        return ["taxedPrice." + entry, formatMoney];
      case 'totalPrice':
        return [entry, formatMoney];
      case 'lineItems.price':
        return [entry, formatPrice];
      case 'lineItems.state':
        return [entry, formatStates];
      case 'lineItems.variant.images':
        return [entry, formatImages];
      case 'lineItems.supplyChannel':
        return [entry, formatChannel];
      case 'customerGroup':
        return [entry, formatCustomerGroup];
      default:
        return [entry];
    }
  };

  formatPrice = function(price) {
    var channelKeyPart, countryPart, customerGroupPart;
    if ((price != null ? price.value : void 0) != null) {
      countryPart = '';
      if (price.country != null) {
        countryPart = "" + price.country + "-";
      }
      customerGroupPart = '';
      if (price.customerGroup != null) {
        customerGroupPart = " " + price.customerGroup.id;
      }
      channelKeyPart = '';
      if (price.channel != null) {
        channelKeyPart = "#" + price.channel.id;
      }
      return "" + countryPart + price.value.currencyCode + " " + price.value.centAmount + customerGroupPart + channelKeyPart;
    }
  };

  formatMoney = function(money) {
    return "" + money.currencyCode + " " + money.centAmount;
  };

  formatStates = function(states) {
    return _.reduce(states, function(cell, state) {
      return "" + state.state.obj.key + ":" + state.quantity + ";" + cell;
    }, '');
  };

  formatImages = function(images) {
    return _.reduce(images, function(cell, image) {
      return "" + image.url + ";" + cell;
    }, '');
  };

  formatChannel = function(channel) {
    if (channel != null) {
      return "" + channel.obj.key;
    }
  };

  formatCustomerGroup = function(customerGroup) {
    if (customerGroup != null) {
      return "" + customerGroup.obj.name;
    }
  };

  CsvMapping.prototype.parse = function(csvString) {
    return new Promise(function(resolve, reject) {
      return Csv().from.string(csvString).on('error', function(error) {
        return reject(error);
      }).to.array(function(data) {
        return resolve(data);
      });
    });
  };

  CsvMapping.prototype.toCSV = function(header, data) {
    return new Promise(function(resolve, reject) {
      return Csv().from([header].concat(data)).on('error', function(error) {
        return reject(error);
      }).to.string(function(asString) {
        return resolve(asString);
      });
    });
  };

  return CsvMapping;

})();

module.exports = CsvMapping;
