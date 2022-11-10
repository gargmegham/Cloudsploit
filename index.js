var express = require('express');
var engine = require('./engine.js');
require('dotenv').config();

var app = express();
var PORT = 8000;

// For parsing application/json
app.use(express.json());

// For parsing application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.send('Hello World'));

app.post('/scan', function (req, res) {
  engine(req.body.cloudConfig, req.body.settings);
  res.send();
});

app.listen(PORT, function (err) {
  if (err) console.log(err);
  console.log("Server listening on PORT", PORT);
});