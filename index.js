const engine = require("./engine.js");

exports.handler = async (event) => {
  engine(event["cloudConfig"], event["settings"]);
  const response = {
    statusCode: 200,
    body: "Triggered successfully!",
  };
  return response;
};
