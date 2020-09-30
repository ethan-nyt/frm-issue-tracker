require('dotenv').config()
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

const SLACK_URLS = {
  OPEN_VIEWS: 'https://slack.com/api/views.open'
}

// slack POST requests are URL encoded, but the "payload" key is JSON.
app.use(bodyParser.urlencoded({ extended: true }));

const verifyToken = token => {
  return token === process.env.VERIFICATION_TOKEN;
};

const openModal = (triggerID) => {
  const payload = {
    "trigger_id": triggerID,
    "view": {
      "type": "modal",
      "callback_id": "modal-identifier",
      "title": {
        "type": "plain_text",
        "text": "Just a modal"
      },
      "blocks": [
        {
          "type": "section",
          "block_id": "section-identifier",
          "text": {
            "type": "mrkdwn",
            "text": "*Welcome* to ~my~ Block Kit _modal_!"
          },
          "accessory": {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": "Just a button"
            },
            "action_id": "button-identifier"
          }
        }
      ]
    }
  }
  return axios.post(SLACK_URLS.OPEN_VIEWS, payload, {
    headers: {
      Authorization: `Bearer ${process.env.BOT_ACCESS_TOKEN}`
    }
  })
}

/**
 * Responds to any HTTP request.
 *
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */
const handleRequest = (req, res) => {
  const payload = JSON.parse(req.body.payload);
  console.log('received payload:', payload);
  const { message, response_url: responseURL, trigger_id: triggerID } = payload;
  const authenticated = verifyToken(payload.token);
  if (!authenticated) {
    return res.sendStatus(401);
  }
  openModal(triggerID).then(() => {
    console.log('successfully opened modal');
  }).catch(err => console.log('failed to open modal:', err));
  axios.post(responseURL, {
    text: "I'll create a task using this message in the frm backlog"
  }).then(() => console.log('successfully posted to response url')).catch(err => console.log('failed to post to response url:', err));
  return res.sendStatus(200);
};

app.get('/', (req, res) => {
  res.send('Hello World!')
});

app.post('/carebear_create', handleRequest);

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
});