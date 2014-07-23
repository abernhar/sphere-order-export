/* ===========================================================
# sphere-order-export - v0.17.6
# ==============================================================
# Copyright (c) 2014 Hajo Eichler
# Licensed under the MIT license.
*/
var XmlMapping, builder, _;

_ = require('underscore');

builder = require('xmlbuilder');

XmlMapping = (function() {
  function XmlMapping(options) {
    if (options == null) {
      options = {};
    }
    this.standardShippingMethod = options.standardShippingMethod || 'None';
  }

  XmlMapping.prototype.mapOrder = function(order, paymentInfo, customer) {
    var attr, attribs, customLineItem, lineItem, price, si, states, tax, variant, xLi, xPi, xPrice, xSi, xT, xVariant, xml, _i, _j, _k, _l, _len, _len1, _len2, _len3, _len4, _len5, _len6, _m, _n, _o, _ref, _ref1, _ref2, _ref3, _ref4;
    xml = builder.create('order', {
      'version': '1.0',
      'encoding': 'UTF-8',
      'standalone': true
    });
    xml.e('xsdVersion').t('0.9');
    attribs = ['id', 'orderNumber', 'version', 'createdAt', 'lastModifiedAt', 'country', 'customerId', 'customerEmail'];
    for (_i = 0, _len = attribs.length; _i < _len; _i++) {
      attr = attribs[_i];
      this._add(xml, order, attr);
    }
    if (customer != null ? customer.customerNumber : void 0) {
      xml.e('customerNumber').t(customer.customerNumber);
    }
    if (customer != null ? customer.externalId : void 0) {
      xml.e('externalCustomerId').t(customer.externalId);
    }
    states = ['orderState', 'shipmentState', 'paymentState'];
    for (_j = 0, _len1 = states.length; _j < _len1; _j++) {
      attr = states[_j];
      this._add(xml, order, attr, attr, 'Pending');
    }
    if (order.taxedPrice) {
      price = order.taxedPrice;
      xPrice = xml.e('taxedPrice');
      this._money(xPrice, price, 'totalNet');
      this._money(xPrice, price, 'totalGross');
      _ref = price.taxPortions;
      for (_k = 0, _len2 = _ref.length; _k < _len2; _k++) {
        tax = _ref[_k];
        xT = xPrice.e('taxPortions');
        xT.e('rate').t(tax.rate);
        this._money(xT, tax, 'amount');
      }
    }
    if (order.shippingAddress) {
      this._address(xml.e('shippingAddress'), order.shippingAddress);
    }
    if (order.billingAddress) {
      this._address(xml.e('billingAddress'), order.billingAddress);
    }
    this._customerGroup(xml, order);
    if (paymentInfo != null) {
      xPi = xml.e('paymentInfo');
      if (paymentInfo.value.paymentMethod) {
        this._add(xPi, paymentInfo.value, 'paymentMethod');
      }
      if (paymentInfo.value.paymentTransaction) {
        xPi.e('paymentID').t(paymentInfo.value.paymentTransaction).up();
      }
    }
    si = order.shippingInfo;
    xSi = xml.e('shippingInfo');
    if (order.shippingInfo != null) {
      this._add(xSi, si, 'shippingMethodName');
      this._add(xSi, si, 'trackingData');
      this._money(xSi, si, 'price');
      this._taxRate(xSi, si);
    } else {
      xSi.e('shippingMethodName').t(this.standardShippingMethod).up();
    }
    if (order.lineItems) {
      _ref1 = order.lineItems;
      for (_l = 0, _len3 = _ref1.length; _l < _len3; _l++) {
        lineItem = _ref1[_l];
        xLi = xml.e('lineItems');
        this._add(xLi, lineItem, 'id');
        this._add(xLi, lineItem, 'productId');
        this._add(xLi, lineItem.name, 'de', 'name');
        variant = lineItem.variant;
        xVariant = xLi.e('variant');
        this._add(xVariant, variant, 'id');
        this._add(xVariant, variant, 'sku');
        if (variant.prices) {
          _ref2 = variant.prices;
          for (_m = 0, _len4 = _ref2.length; _m < _len4; _m++) {
            price = _ref2[_m];
            this._priceElem(xVariant.e('prices'), price);
          }
        }
        if (variant.attributes) {
          _ref3 = variant.attributes;
          for (_n = 0, _len5 = _ref3.length; _n < _len5; _n++) {
            attr = _ref3[_n];
            this._attributes(xVariant.e('attributes'), attr);
          }
        }
        this._add(xLi, variant, 'sku');
        this._price(xLi, lineItem);
        this._add(xLi, lineItem, 'quantity');
        this._lineItemPrice(xLi, lineItem.price.value.centAmount, lineItem.quantity, lineItem.price.value.currencyCode);
        this._taxRate(xLi, lineItem);
      }
    }
    if (order.customLineItems) {
      _ref4 = order.customLineItems;
      for (_o = 0, _len6 = _ref4.length; _o < _len6; _o++) {
        customLineItem = _ref4[_o];
        this._customLineItem(xml.e('customLineItems'), customLineItem);
      }
    }
    return xml;
  };

  XmlMapping.prototype._customLineItem = function(xml, elem) {
    this._add(xml, elem, 'id');
    this._add(xml, elem.name, 'de', 'name');
    this._money(xml, elem, 'money');
    this._add(xml, elem, 'slug');
    this._add(xml, elem, 'quantity');
    this._lineItemPrice(xml, elem.money.centAmount, elem.quantity, elem.money.currencyCode);
    return this._taxRate(xml, elem);
  };

  XmlMapping.prototype._attributes = function(xml, elem) {
    var val;
    val = elem.value;
    if (_.has(val, 'key') && _.has(val, 'label')) {
      val = val.key;
    }
    if (_.has(val, 'centAmount') && _.has(val, 'currencyCode')) {
      val = "" + val.currencyCode + " " + val.centAmount;
    }
    return xml.e('name').t(elem.name).up().e('value').t(val);
  };

  XmlMapping.prototype._money = function(xml, elem, name) {
    return xml.e(name).e('currencyCode').t(elem[name].currencyCode).up().e('centAmount').t(elem[name].centAmount);
  };

  XmlMapping.prototype._price = function(xml, elem, name) {
    if (name == null) {
      name = 'price';
    }
    return this._priceElem(xml.e(name), elem.price);
  };

  XmlMapping.prototype._priceElem = function(xP, p) {
    this._money(xP, p, 'value');
    this._add(xP, p, 'country');
    return this._customerGroup(xP, p);
  };

  XmlMapping.prototype._lineItemPrice = function(xml, centAmount, quantity, currencyCode) {
    var p, total;
    total = centAmount * quantity;
    p = {
      price: {
        value: {
          currencyCode: currencyCode,
          centAmount: total
        }
      }
    };
    return this._price(xml, p, 'lineItemPrice');
  };

  XmlMapping.prototype._taxRate = function(xml, elem) {
    var attr, attribs, tr, xTr, _i, _len, _results;
    tr = elem.taxRate;
    xTr = xml.e('taxRate');
    attribs = ['id', 'name', 'amount', 'includedInPrice', 'country', 'state'];
    _results = [];
    for (_i = 0, _len = attribs.length; _i < _len; _i++) {
      attr = attribs[_i];
      _results.push(this._add(xTr, tr, attr));
    }
    return _results;
  };

  XmlMapping.prototype._customerGroup = function(xml, elem) {
    var cg, xCg;
    cg = elem.customerGroup;
    if (cg) {
      xCg = xml.e('customerGroup');
      this._add(xCg, cg, 'id');
      if (cg.obj) {
        this._add(xCg, cg.obj, 'version');
        return this._add(xCg, cg.obj, 'name');
      }
    }
  };

  XmlMapping.prototype._address = function(xml, address) {
    var attr, attribs, _i, _len, _results;
    attribs = ['id', 'title', 'salutation', 'firstName', 'lastName', 'streetName', 'streetNumber', 'additionalStreetInfo', 'postalCode', 'city', 'region', 'state', 'country', 'company', 'department', 'building', 'apartment', 'pOBox', 'phone', 'mobile', 'email'];
    _results = [];
    for (_i = 0, _len = attribs.length; _i < _len; _i++) {
      attr = attribs[_i];
      _results.push(this._add(xml, address, attr));
    }
    return _results;
  };

  XmlMapping.prototype._add = function(xml, elem, attr, xAttr, fallback) {
    var value;
    if (!xAttr) {
      xAttr = attr;
    }
    value = elem[attr];
    if (!value) {
      value = fallback;
    }
    if (value) {
      return xml.e(xAttr).t(value).up();
    }
  };

  return XmlMapping;

})();

module.exports = XmlMapping;
