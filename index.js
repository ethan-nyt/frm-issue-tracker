require('dotenv').config()
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const app = express();
const port = 3000

app.use(bodyParser.urlencoded({ extended: true }));

const verifyToken = token => {
  console.log('checking', token, 'against:', process.env.VERIFICATION_TOKEN);
  return token === process.env.VERIFICATION_TOKEN;
};

/**
 * Responds to any HTTP request.
 *
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */
const handleRequest = (req, res) => {
  // NOTE since we're using json middleware here we don't need to parse the payload - may change when we deploy to gcp
  const payload = JSON.parse(req.body.payload);
  console.log('received payload:', payload);
  const authenticated = verifyToken(payload.token);
  if (!authenticated) {
    return res.sendStatus(401);
  }
  console.log('echoing message back to response_url');
  // echo the message back to the response url
  axios.post(payload.response_url, {
    text: payload.message.text
  }).then(() => console.log('successfully posted to response url')).catch(err => console.log('failed to post to response url:', err));
  // message text will be stored under req.body.message.text
  console.log('sending 200 status back.');
  return res.sendStatus(200);
};

app.get('/', (req, res) => {
  res.send('Hello World!')
});

app.post('/carebear_create', handleRequest);

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
});