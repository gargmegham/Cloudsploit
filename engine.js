var async = require("async");
const { Console } = require("console");
const fs = require("fs");
var exports = require("./exports.js");
var suppress = require("./postprocess/suppress.js");
var output = require("./postprocess/output.js");

const myLogger = new Console({
  stdout: fs.createWriteStream("consoleLog.txt"),
  stderr: fs.createWriteStream("consoleError.txt"),
});

/**
 * The main function to execute CloudSploit scans.
 * @param cloudConfig The configuration for the cloud provider.
 * @param settings General purpose settings.
 */
var engine = async function (cloudConfig, settings) {
  myLogger.log("Starting engine.... for " + cloudConfig.userId);
  // Initialize any suppression rules based on the the command line arguments
  var suppressionFilter = suppress.create(settings.suppress);

  // Initialize the output handler
  var outputHandler = output.create(settings);

  // Configure Service Provider Collector
  var collector = require(`./collectors/${settings.cloud}/collector.js`);
  var plugins = exports[settings.cloud];
  var apiCalls = [];

  // Load resource mappings
  var resourceMap;
  try {
    resourceMap = require(`./helpers/${settings.cloud}/resources.js`);
  } catch (e) {
    resourceMap = {};
  }

  var skippedPlugins = [];

  Object.entries(plugins).forEach(function (p) {
    var pluginId = p[0];
    var plugin = p[1];

    // Skip plugins that don't match the ID flag
    var skip = false;
    if (settings.plugin && settings.plugin !== pluginId) {
      skip = true;
    } else {
      // Skip GitHub plugins that do not match the run type
      if (settings.cloud == "github") {
        if (cloudConfig.organization && plugin.types.indexOf("org") === -1) {
          skip = true;
        } else if (
          !cloudConfig.organization &&
          plugin.types.indexOf("org") === -1
        ) {
          skip = true;
        }
      }

      if (settings.compliance && settings.compliance.length) {
        if (!plugin.compliance || !Object.keys(plugin.compliance).length) {
          skip = true;
        } else {
          // Compare
          var cMatch = false;
          settings.compliance.forEach(function (c) {
            if (plugin.compliance[c]) cMatch = true;
          });
          if (!cMatch) {
            skip = true;
          }
        }
      }
    }

    if (skip) {
      skippedPlugins.push(pluginId);
    } else {
      plugin.apis.forEach(function (api) {
        if (apiCalls.indexOf(api) === -1) apiCalls.push(api);
      });
    }
  });

  if (!apiCalls.length) return myLogger.error("ERROR: Nothing to collect.");

  // STEP 2 - Collect API Metadata from Service Providers
  collector(
    cloudConfig,
    {
      api_calls: apiCalls,
      paginate: settings.skip_paginate,
      govcloud: settings.govcloud,
      china: settings.china,
    },
    function (err, collection) {
      if (err || !collection || !Object.keys(collection).length)
        return myLogger.error(
          `ERROR: Unable to obtain API metadata: ${err || "No data returned"}`
        );
      var maximumStatus = 0;
      function executePlugins() {
        async.mapValuesLimit(
          plugins,
          10,
          function (plugin, key, pluginDone) {
            if (skippedPlugins.indexOf(key) > -1) return pluginDone(null, 0);

            var postRun = function (err, results) {
              if (err) return myLogger.error(`ERROR: ${err}`);
              if (!results || !results.length) {
                myLogger.error(
                  `Plugin ${plugin.title} returned no results. There may be a problem with this plugin.`
                );
              } else {
                for (var r in results) {
                  // If we have suppressed this result, then don't process it
                  // so that it doesn't affect the return code.
                  if (
                    suppressionFilter(
                      [
                        key,
                        results[r].region || "any",
                        results[r].resource || "any",
                      ].join(":")
                    )
                  ) {
                    continue;
                  }

                  var complianceMsg = [];
                  if (settings.compliance && settings.compliance.length) {
                    settings.compliance.forEach(function (c) {
                      if (plugin.compliance && plugin.compliance[c]) {
                        complianceMsg.push(
                          `${c.toUpperCase()}: ${plugin.compliance[c]}`
                        );
                      }
                    });
                  }
                  complianceMsg = complianceMsg.join("; ");
                  if (!complianceMsg.length) complianceMsg = null;

                  // Write out the result (to console or elsewhere)
                  outputHandler.writeResult(
                    results[r],
                    plugin,
                    key,
                    complianceMsg
                  );

                  // Add this to our tracking for the worst status to calculate
                  // the exit code
                  maximumStatus = Math.max(maximumStatus, results[r].status);
                }
              }
              setTimeout(function () {
                pluginDone(err, maximumStatus);
              }, 0);
            };
            plugin.run(collection, settings, postRun);
          },
          function (err) {
            if (err) return myLogger.error(err);
            outputHandler.close(cloudConfig);
          }
        );
      }
      executePlugins();
    }
  );
};

module.exports = engine;
