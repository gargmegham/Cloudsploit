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

module.exports = {
  createJson: function (stream) {
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
  create: function (settings) {
    var outputs = [];
    if (settings.json) {
      outputs.push(this.createJson(null));
    }
    return {
      writeResult: function (result, plugin, pluginKey, complianceMsg) {
        outputs.forEach(function (output) {
          output.writeResult(result, plugin, pluginKey, complianceMsg);
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
