var fs = require("fs");
const { Console } = require("console");
var AWS = require("aws-sdk");

const myLogger = new Console({
  stdout: fs.createWriteStream("s3Log.txt"),
  stderr: fs.createWriteStream("s3Log.txt"),
});

require("dotenv").config();

var s3 = new AWS.S3({
  accessKeyId: process.env.S3_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_AWS_SECRET_ACCESS_KEY,
});

function exchangeStatusWord(result) {
  if (result.status === 0) return "OK";
  if (result.status === 1) return "WARN";
  if (result.status === 2) return "FAIL";
  return "UNKNOWN";
}

function commaSafe(str) {
  if (!str) return "";
  return str.replace(/,/g, " ");
}

function log(msg, settings) {
  if (!settings.mocha) console.log(msg);
}

module.exports = {
  /**
   * Creates an output handler that writes output in the CSV format.
   * @param {fs.WriteSteam} stream The stream to write to or an object that
   * obeys the writeable stream contract.
   * @param {Object} settings The source settings object
   */
  createCsv: function (stream, settings) {
    var headers = [
      "category",
      "title",
      "description",
      "resource",
      "region",
      "statusWord",
      "message",
    ];
    if (settings.compliance) headers.push("compliance");
    var csvWriter = require("csv-write-stream");
    var writer = csvWriter({ headers: headers });
    writer.pipe(stream);

    return {
      writer: writer,

      writeResult: function (result, plugin, pluginKey, complianceMsg) {
        var toWrite = [
          plugin.category,
          plugin.title,
          commaSafe(plugin.description),
          result.resource || "N/A",
          result.region || "Global",
          exchangeStatusWord(result),
          commaSafe(result.message),
        ];

        if (settings.compliance) toWrite.push(complianceMsg || "");

        this.writer.write(toWrite);
      },

      close: function (cloudConfig) {
        this.writer.end();
        log(`INFO: CSV file written to ${settings.csv}`, settings);
      },
    };
  },

  /**
   * Creates an output handler that writes output in the JSON format.
   * @param {fs.WriteSteam} stream The stream to write to or an object that
   * obeys the writeable stream contract.
   */
  createJson: function (stream, settings) {
    var results = [];
    return {
      stream: stream,

      writeResult: function (result, plugin, pluginKey, complianceMsg) {
        var toWrite = {
          ...plugin,
          plugin: pluginKey,
          resource: result.resource || "N/A",
          region: result.region || "Global",
          status: exchangeStatusWord(result),
          message: result.message,
        };

        if (complianceMsg) toWrite.compliance = complianceMsg;
        results.push(toWrite);
      },

      close: async function (settings) {
        // get date in javascript format DD_MM_YYYY
        var date = new Date();
        var dateStr =
          date.getDate() +
          "_" +
          (date.getMonth() + 1) +
          "_" +
          date.getFullYear();
        const params = {
          Bucket: "cloudsploit-scans",
          Key: `${settings.company_id}_${settings.cloud}.json`,
          Body: JSON.stringify(results, null, 2),
          ContentType: "application/json",
        };
        try {
          await s3.putObject(params).promise();
        } catch (err) {
          myLogger.error(err);
        }
      },
    };
  },
  /**
   * Creates an output handler depending on the arguments list as expected
   * in the command line format. If multiple output handlers are specified
   * in the arguments, then constructs a unified view so that it appears that
   * there is only one output handler.
   *
   * @param {string[]} argv Array of command line arguments (may contain
   * arguments that are not relevant to constructing output handlers).
   *
   * @return A object that obeys the output handler contract. This may be
   * one output handler or one that forwards function calls to a group of
   * output handlers.
   */
  create: function (settings) {
    var outputs = [];

    // Creates the handlers for writing output.
    if (settings.csv) {
      var stream = fs.createWriteStream(settings.csv);
      outputs.push(this.createCsv(stream, settings));
    }

    if (settings.json) {
      outputs.push(this.createJson(null, settings));
    }

    // Ignore any "OK" results - only report issues
    var ignoreOkStatus = settings.ignore_ok;

    // This creates a multiplexer-like object that forwards the
    // call onto any output handler that has been defined. This
    // allows us to simply send the output to multiple handlers
    // and the caller doesn't need to worry about that part.
    return {
      writeResult: function (result, plugin, pluginKey, complianceMsg) {
        outputs.forEach(function (output) {
          if (!(ignoreOkStatus && result.status === 0)) {
            output.writeResult(result, plugin, pluginKey, complianceMsg);
          }
        });
      },

      close: function () {
        outputs.forEach(function (output) {
          output.close(settings);
        });
      },
    };
  },
};
