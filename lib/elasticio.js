/* ===========================================================
# sphere-order-export - v0.18.0
# ==============================================================
# Copyright (c) 2014 Hajo Eichler
# Licensed under the MIT license.
*/
var OrderExport, package_json;

package_json = require('../package.json');

OrderExport = require('./orderexport');

exports.process = function(msg, cfg, next, snapshot) {
  var orderexport;
  orderexport = new OrderExport({
    config: {
      client_id: cfg.sphereClientId,
      client_secret: cfg.sphereClientSecret,
      project_key: cfg.sphereProjectKey
    },
    timeout: 60000,
    user_agent: "" + package_json.name + " - elasticio - " + package_json.version
  });
  return orderexport.elasticio(msg, cfg, next, snapshot);
};
