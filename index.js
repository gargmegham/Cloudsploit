const engine = require("./engine.js");
const express = require('express');

const app = express();

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  engine(req.query.cloudConfig, req.query.settings);
  res.send('Triggered successfully!');
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`))
