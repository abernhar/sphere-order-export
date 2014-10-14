/* ===========================================================
# sphere-order-export - v0.18.0
# ==============================================================
# Copyright (c) 2014 Hajo Eichler
# Licensed under the MIT license.
*/
var ExtendedLogger, OrderExport, ProjectCredentialsConfig, Promise, Sftp, argv, ensureExportDir, fs, fsExistsAsync, logOptions, logger, package_json, path, readJsonFromPath, tmp, _, _ref;

path = require('path');

_ = require('underscore');

Promise = require('bluebird');

fs = Promise.promisifyAll(require('fs'));

tmp = Promise.promisifyAll(require('tmp'));

_ref = require('sphere-node-utils'), ExtendedLogger = _ref.ExtendedLogger, ProjectCredentialsConfig = _ref.ProjectCredentialsConfig, Sftp = _ref.Sftp;

package_json = require('../package.json');

OrderExport = require('./orderexport');

argv = require('optimist').usage('Usage: $0 --projectKey key --clientId id --clientSecret secret').describe('projectKey', 'your SPHERE.IO project-key').describe('clientId', 'your OAuth client id for the SPHERE.IO API').describe('clientSecret', 'your OAuth client secret for the SPHERE.IO API').describe('sphereHost', 'SPHERE.IO API host to connect to').describe('fetchHours', 'Number of hours to fetch modified orders').describe('standardShippingMethod', 'Allows to define the fallback shipping method name if order has none').describe('exportType', 'CSV or XML').describe('exportUnsyncedOnly', 'whether only unsynced orders will be exported or not').describe('targetDir', 'the folder where exported files are saved').describe('useExportTmpDir', 'whether to use a system tmp folder to store exported files').describe('csvTemplate', 'CSV template to define the structure of the export').describe('fileWithTimestamp', 'whether exported file should contain a timestamp').describe('sftpCredentials', 'the path to a JSON file where to read the credentials from').describe('sftpHost', 'the SFTP host (overwrite value in sftpCredentials JSON, if given)').describe('sftpUsername', 'the SFTP username (overwrite value in sftpCredentials JSON, if given)').describe('sftpPassword', 'the SFTP password (overwrite value in sftpCredentials JSON, if given)').describe('sftpTarget', 'path in the SFTP server to where to move the worked files').describe('sftpContinueOnProblems', 'ignore errors when processing a file and continue with the next one').describe('logLevel', 'log level for file logging').describe('logDir', 'directory to store logs').describe('logSilent', 'use console to print messages').describe('timeout', 'Set timeout for requests')["default"]('fetchHours', 48)["default"]('standardShippingMethod', 'None')["default"]('exportType', 'xml')["default"]('exportUnsyncedOnly', true)["default"]('targetDir', path.join(__dirname, '../exports'))["default"]('useExportTmpDir', false)["default"]('fileWithTimestamp', false)["default"]('logLevel', 'info')["default"]('logDir', '.')["default"]('logSilent', false)["default"]('timeout', 60000)["default"]('sftpContinueOnProblems', false).demand(['projectKey']).argv;

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

fsExistsAsync = function(path) {
  return new Promise(function(resolve, reject) {
    return fs.exists(path, function(exists) {
      if (exists) {
        return resolve(true);
      } else {
        return resolve(false);
      }
    });
  });
};

ensureExportDir = function() {
  var exportsPath;
  if (("" + argv.useExportTmpDir) === 'true') {
    return tmp.dirAsync({
      unsafeCleanup: true
    });
  } else {
    exportsPath = argv.targetDir;
    return fsExistsAsync(exportsPath).then(function(exists) {
      if (exists) {
        return Promise.resolve(exportsPath);
      } else {
        return fs.mkdirAsync(exportsPath).then(function() {
          return Promise.resolve(exportsPath);
        });
      }
    });
  }
};

readJsonFromPath = function(path) {
  if (!path) {
    return Promise.resolve({});
  }
  return fs.readFileAsync(path, {
    encoding: 'utf-8'
  }).then(function(content) {
    return Promise.resolve(JSON.parse(content));
  });
};

ProjectCredentialsConfig.create().then((function(_this) {
  return function(credentials) {
    var clientOptions, orderExport;
    clientOptions = {
      config: credentials.enrichCredentials({
        project_key: argv.projectKey,
        client_id: argv.clientId,
        client_secret: argv.clientSecret
      }),
      timeout: argv.timeout,
      user_agent: "" + package_json.name + " - " + package_json.version
    };
    if (argv.sphereHost) {
      clientOptions.host = argv.sphereHost;
    }
    orderExport = new OrderExport({
      client: clientOptions,
      "export": {
        fetchHours: argv.fetchHours,
        standardShippingMethod: argv.standardShippingMethod,
        exportType: argv.exportType,
        exportUnsyncedOnly: argv.exportUnsyncedOnly,
        csvTemplate: argv.csvTemplate
      }
    });
    return ensureExportDir().then(function(outputDir) {
      logger.debug("Created output dir at " + outputDir);
      _this.outputDir = outputDir;
      return orderExport.run();
    }).then(function(data) {
      var csvFile, fileName, ts;
      _this.orderReferences = [];
      ts = (new Date()).getTime();
      if (argv.exportType.toLowerCase() === 'csv') {
        if (argv.fileWithTimestamp) {
          fileName = "orders_" + ts + ".csv";
        } else {
          fileName = 'orders.csv';
        }
        csvFile = argv.csvFile || ("" + _this.outputDir + "/" + fileName);
        logger.info("Storing CSV export to '" + csvFile + "'.");
        return fs.writeFileAsync(csvFile, data);
      } else {
        logger.info("Storing " + (_.size(data)) + " file(s) to '" + _this.outputDir + "'.");
        return Promise.map(data, function(entry) {
          var content;
          content = entry.xml.end({
            pretty: true,
            indent: '  ',
            newline: '\n'
          });
          if (argv.fileWithTimestamp) {
            fileName = "" + entry.id + "_" + ts + ".xml";
          } else {
            fileName = "" + entry.id + ".xml";
          }
          _this.orderReferences.push({
            name: fileName,
            entry: entry
          });
          return fs.writeFileAsync("" + _this.outputDir + "/" + fileName, content);
        }, {
          concurrency: 10
        });
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
            return fs.readdirAsync(_this.outputDir).then(function(files) {
              var filesSkipped;
              logger.info("About to upload " + (_.size(files)) + " file(s) from " + _this.outputDir + " to " + sftpTarget);
              filesSkipped = 0;
              return Promise.map(files, function(filename) {
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
                    return Promise.resolve();
                  }
                })["catch"](function(err) {
                  if (argv.sftpContinueOnProblems) {
                    filesSkipped++;
                    logger.warn(err, "There was an error processing the file " + file + ", skipping and continue");
                    return Promise.resolve();
                  } else {
                    return Promise.reject(err);
                  }
                });
              }, {
                concurrency: 1
              }).then(function() {
                var totFiles;
                totFiles = _.size(files);
                if (totFiles > 0) {
                  logger.info("Export to SFTP successfully finished: " + (totFiles - filesSkipped) + " out of " + totFiles + " files were processed");
                } else {
                  logger.info("Export successfully finished: there were no new files to be processed");
                }
                sftpClient.close(sftp);
                return Promise.resolve();
              });
            })["finally"](function() {
              return sftpClient.close(sftp);
            });
          })["catch"](function(err) {
            logger.error(err, 'There was an error uploading the files to SFTP');
            return _this.exitCode = 1;
          });
        })["catch"](function(err) {
          logger.error(err, "Problems on getting sftp credentials from config files for project " + argv.projectKey + ".");
          return _this.exitCode = 1;
        });
      } else {
        return Promise.resolve();
      }
    }).then(function() {
      logger.info('Orders export complete');
      return _this.exitCode = 0;
    })["catch"](function(error) {
      logger.error(error, 'Oops, something went wrong!');
      return _this.exitCode = 1;
    }).done();
  };
})(this))["catch"]((function(_this) {
  return function(err) {
    logger.error(err, 'Problems on getting client credentials from config files.');
    return _this.exitCode = 1;
  };
})(this)).done();
