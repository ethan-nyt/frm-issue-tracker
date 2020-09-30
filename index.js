require('dotenv').config()
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

const SLACK_URLS = {
  OPEN_VIEWS: 'https://slack.com/api/views.open'
};

const PAYLOAD_TYPES = {
  BLOCK_ACTIONS: 'block_actions',
  MESSAGE_ACTIONS: 'message_action',
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
        "text": "Create an Issue"
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
        },
      ]
    }
  }
  return axios.post(SLACK_URLS.OPEN_VIEWS, payload, {
    headers: {
      Authorization: `Bearer ${process.env.BOT_ACCESS_TOKEN}`
    }
  })
};

const handleBlockAction = payload => {
  console.log('received block action payload:', payload);
};

const handleMessageAction = payload => {
  console.log('received message action payload:', payload);
  const { message, response_url: responseURL, trigger_id: triggerID, type } = payload;
  console.log('received message:', typeof message.text === 'object' ? JSON.stringify(message.text) : message.text);
  openModal(triggerID).then(() => {
    console.log('successfully opened modal');
  }).catch(err => console.log('failed to open modal:', err));
};

// handleRequest is the main entry point to the carebear message action.
const handleRequest = (req, res) => {
  const payload = JSON.parse(req.body.payload);
  const authenticated = verifyToken(payload.token);
  if (authenticated) {
    // send acknowledgement response. must include an object as the body otherwise slack doesn't recognize it!
    res.status(200).send({ ok: true });
  } else {
    return res.sendStatus(401);
  }
  console.log('received payload', payload);
  switch (payload.type) {
    case PAYLOAD_TYPES.MESSAGE_ACTIONS:
      handleMessageAction(payload);
      break;
    case PAYLOAD_TYPES.BLOCK_ACTIONS:
      handleBlockAction(payload);
      break;
    default: break;
  }
};

app.post('/carebear_create', handleRequest);

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
});