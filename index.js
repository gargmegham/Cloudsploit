var express = require('express');
var app = express();
var PORT = 3000;

// For parsing application/json
app.use(express.json());

// For parsing application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

app.post('/scan', function (req, res) {
  engine.scan(req.body.cloudConfig, req.body.settings);
  res.send();
});

app.listen(PORT, function (err) {
  if (err) console.log(err);
  console.log("Server listening on PORT", PORT);
});