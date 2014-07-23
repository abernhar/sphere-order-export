/* ===========================================================
# sphere-order-export - v0.17.6
# ==============================================================
# Copyright (c) 2014 Hajo Eichler
# Licensed under the MIT license.
*/
var ExtendedLogger, OrderExport, ProjectCredentialsConfig, Q, Qutils, Sftp, TaskQueue, argv, createTmpDir, ensureExportDir, fs, isCsvMode, logOptions, logger, package_json, readJsonFromPath, tmp, _, _ref;

fs = require('q-io/fs');

Q = require('q');

_ = require('underscore');

tmp = require('tmp');

_ref = require('sphere-node-utils'), ExtendedLogger = _ref.ExtendedLogger, ProjectCredentialsConfig = _ref.ProjectCredentialsConfig, Sftp = _ref.Sftp, Qutils = _ref.Qutils, TaskQueue = _ref.TaskQueue;

package_json = require('../package.json');

OrderExport = require('../lib/orderexport');

argv = require('optimist').usage('Usage: $0 --projectKey key --clientId id --clientSecret secret').describe('projectKey', 'your SPHERE.IO project-key').describe('clientId', 'your OAuth client id for the SPHERE.IO API').describe('clientSecret', 'your OAuth client secret for the SPHERE.IO API').describe('sphereHost', 'SPHERE.IO API host to connecto to').describe('fetchHours', 'Number of hours to fetch modified orders').describe('standardShippingMethod', 'Allows to define the fallback shipping method name of order has none').describe('useExportTmpDir', 'whether to use a tmp folder to store resulting XML files in or not (if no, files will be created under \'./exports\')').describe('csvTemplate', 'CSV template to define the structure of the export - if present only one CSV file will be generated, otherwise XML files').describe('csvFile', "CSV file to export template to, otherwise see option 'useExportTmpDir'").describe('sftpCredentials', 'the path to a JSON file where to read the credentials from').describe('sftpHost', 'the SFTP host (overwrite value in sftpCredentials JSON, if given)').describe('sftpUsername', 'the SFTP username (overwrite value in sftpCredentials JSON, if given)').describe('sftpPassword', 'the SFTP password (overwrite value in sftpCredentials JSON, if given)').describe('sftpTarget', 'path in the SFTP server to where to move the worked files').describe('logLevel', 'log level for file logging').describe('logDir', 'directory to store logs').describe('logSilent', 'use console to print messages').describe('timeout', 'Set timeout for requests')["default"]('fetchHours', 0)["default"]('standardShippingMethod', 'None')["default"]('useExportTmpDir', false)["default"]('logLevel', 'info')["default"]('logDir', '.')["default"]('logSilent', false)["default"]('timeout', 60000).demand(['projectKey']).argv;

logOptions = {
  name: "" + package_json.name + "-" + package_json.version,
  streams: [
    {
      level: 'error',
      stream: process.stderr
    }, {
      level: argv.logLevel,
      path: "" + argv.logDir + "/sphere-order-xml-export.log"
    }
  ]
};

if (argv.logSilent) {
  logOptions.silent = argv.logSilent;
}

logger = new ExtendedLogger({
  additionalFields: {
    project_key: argv.projectKey
  },
  logConfig: logOptions
});

if (argv.logSilent) {
  logger.bunyanLogger.trace = function() {};
  logger.bunyanLogger.debug = function() {};
}

process.on('SIGUSR2', function() {
  return logger.reopenFileStreams();
});

process.on('exit', (function(_this) {
  return function() {
    return process.exit(_this.exitCode);
  };
})(this));

tmp.setGracefulCleanup();

createTmpDir = function() {
  var d;
  d = Q.defer();
  tmp.dir({
    unsafeCleanup: true
  }, function(err, path) {
    if (err) {
      return d.reject(err);
    } else {
      return d.resolve(path);
    }
  });
  return d.promise;
};

ensureExportDir = function() {
  var exportsPath;
  if (("" + argv.useExportTmpDir) === 'true') {
    return createTmpDir();
  } else {
    exportsPath = "" + __dirname + "/../exports";
    return fs.exists(exportsPath).then(function(exists) {
      if (exists) {
        return Q(exportsPath);
      } else {
        return fs.makeDirectory(exportsPath).then(function() {
          return Q(exportsPath);
        });
      }
    }).fail(function(err) {
      return Q.reject(err);
    });
  }
};

readJsonFromPath = function(path) {
  if (!path) {
    return Q({});
  }
  return fs.read(path).then(function(content) {
    return Q(JSON.parse(content));
  });
};

isCsvMode = function() {
  return argv.csvTemplate != null;
};

ProjectCredentialsConfig.create().then((function(_this) {
  return function(credentials) {
    var client, options, orderExport, tq;
    options = {
      config: credentials.enrichCredentials({
        project_key: argv.projectKey,
        client_id: argv.clientId,
        client_secret: argv.clientSecret
      }),
      timeout: argv.timeout,
      user_agent: "" + package_json.name + " - " + package_json.version,
      logConfig: {
        logger: logger.bunyanLogger
      }
    };
    if (argv.sphereHost) {
      options.host = argv.sphereHost;
    }
    options.standardShippingMethod = argv.standardShippingMethod;
    orderExport = new OrderExport(options);
    client = orderExport.client;
    tq = new TaskQueue;
    return ensureExportDir().then(function(outputDir) {
      logger.debug("Created output dir at " + outputDir);
      _this.outputDir = outputDir;
      return client.orders.expand('lineItems[*].state[*].state').expand('lineItems[*].supplyChannel').expand('customerGroup').last("" + argv.fetchHours + "h").perPage(0).fetch();
    }).then(function(result) {
      return orderExport.processOrders(result.body.results, argv.csvTemplate);
    }).then(function(result) {
      var csvFile, fileName;
      _this.orderReferences = [];
      if (isCsvMode()) {
        csvFile = argv.csvFile || ("" + _this.outputDir + "/orders.csv");
        logger.info("Storing CSV export to '" + csvFile + "'.");
        fileName = 'orders.csv';
        return Q(fs.write(csvFile, result));
      } else {
        logger.info("Storing " + (_.size(result)) + " file(s) to '" + _this.outputDir + "'.");
        return Q.all(_.map(result, function(entry) {
          return tq.addTask(function() {
            var content;
            content = entry.xml.end({
              pretty: true,
              indent: '  ',
              newline: "\n"
            });
            fileName = "" + entry.id + ".xml";
            _this.orderReferences.push({
              name: fileName,
              entry: entry
            });
            return fs.write("" + _this.outputDir + "/" + fileName, content);
          });
        }));
      }
    }).then(function() {
      var sftpCredentials, sftpHost, sftpPassword, sftpUsername;
      sftpCredentials = argv.sftpCredentials, sftpHost = argv.sftpHost, sftpUsername = argv.sftpUsername, sftpPassword = argv.sftpPassword;
      if (sftpCredentials || (sftpHost && sftpUsername && sftpPassword)) {
        return readJsonFromPath(sftpCredentials).then(function(credentials) {
          var host, password, projectSftpCredentials, sftpClient, sftpTarget, username, _ref1;
          projectSftpCredentials = credentials[argv.projectKey] || {};
          _ref1 = _.defaults(projectSftpCredentials, {
            host: sftpHost,
            username: sftpUsername,
            password: sftpPassword,
            sftpTarget: argv.sftpTarget
          }), host = _ref1.host, username = _ref1.username, password = _ref1.password, sftpTarget = _ref1.sftpTarget;
          if (!host) {
            throw new Error('Missing sftp host');
          }
          if (!username) {
            throw new Error('Missing sftp username');
          }
          if (!password) {
            throw new Error('Missing sftp password');
          }
          sftpClient = new Sftp({
            host: host,
            username: username,
            password: password,
            logger: logger
          });
          return sftpClient.openSftp().then(function(sftp) {
            return fs.list(_this.outputDir).then(function(files) {
              logger.info("About to upload " + (_.size(files)) + " file(s) from " + _this.outputDir + " to " + sftpTarget);
              return Qutils.processList(files, function(fileParts) {
                var filename;
                if (fileParts.length !== 1) {
                  throw new Error('Files should be processed once at a time');
                }
                filename = fileParts[0];
                logger.debug("Uploading " + _this.outputDir + "/" + filename);
                return sftpClient.safePutFile(sftp, "" + _this.outputDir + "/" + filename, "" + sftpTarget + "/" + filename).then(function() {
                  var xml;
                  xml = _.find(_this.orderReferences, function(r) {
                    return r.name === filename;
                  });
                  if (xml) {
                    logger.debug("About to sync order " + filename);
                    return orderExport.syncOrder(xml.entry, filename);
                  } else {
                    logger.warn("Not able to create syncInfo for " + filename + " as xml for that file was not found");
                    return Q();
                  }
                });
              }, {
                accumulate: false
              }).then(function() {
                logger.info("Successfully uploaded " + (_.size(files)) + " file(s)");
                sftpClient.close(sftp);
                return Q();
              });
            }).fail(function(err) {
              sftpClient.close(sftp);
              return Q.reject(err);
            });
          });
        }).fail(function(err) {
          logger.error(err, "Problems on getting sftp credentials from config files for project " + argv.projectKey + ".");
          return _this.exitCode = 1;
        });
      } else {
        return Q();
      }
    }).then(function() {
      logger.info('Orders export complete');
      return _this.exitCode = 0;
    }).fail(function(error) {
      logger.error(error, 'Oops, something went wrong!');
      return _this.exitCode = 1;
    }).done();
  };
})(this)).fail((function(_this) {
  return function(err) {
    logger.error(err, 'Problems on getting client credentials from config files.');
    return _this.exitCode = 1;
  };
})(this)).done();
