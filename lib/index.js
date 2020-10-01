"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;
const types_1 = require("./types");
const headers = {
    Authorization: `Bearer ${process.env.BOT_ACCESS_TOKEN}`
};
const SLACK_URLS = {
    OPEN_VIEWS: 'https://slack.com/api/views.open',
    UPDATE_VIEWS: 'https://slack.com/api/views.update',
};
const PRIORITY_DESCRIPTIONS = {
    [types_1.Rank.Low]: {
        type: 'plain_text',
        text: "This issue is not your top priority - only look into it if there are no higher priority tasks in the backlog."
    },
    [types_1.Rank.High]: {
        type: 'plain_text',
        text: "This issue should be handled as soon as possible.",
    },
    [types_1.Rank.Critical]: {
        type: 'plain_text',
        text: "This issue requires immediate action."
    },
};
// slack POST requests are URL encoded, but the "payload" key is JSON.
app.use(bodyParser.urlencoded({ extended: true }));
// the server needs some state in order to track a user's interactions with views that the app opens dynamically within slack.
const state = {
    // ranks is a map of view id's to the last selected rank in that view.
    ranks: {},
    // messages is a map of user id's (the ID for the user who clicked "create an issue") to message objects.
    messages: {},
    // views is a map of user id's to the view that user is currently looking at.
    views: {},
};
const verifyToken = (token) => {
    return token === process.env.VERIFICATION_TOKEN;
};
const openModal = (triggerID, userID) => {
    const payload = {
        "trigger_id": triggerID,
        "callback_id": types_1.CallbackIDs.SetRank,
        "view": {
            "private_metadata": userID,
            "type": "modal",
            "title": {
                "type": "plain_text",
                "text": "Care Bear 🐻❤️🧡💛💚💙💜🖤🐻",
                "emoji": true
            },
            "submit": {
                "type": "plain_text",
                "text": "Submit",
                "emoji": true
            },
            "close": {
                "type": "plain_text",
                "text": "Cancel",
                "emoji": true
            },
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "plain_text",
                        "text": "How would you rank this issue?"
                    },
                    "accessory": {
                        "type": "radio_buttons",
                        "action_id": types_1.ACTION_TYPES.RankIssue,
                        "options": [
                            {
                                "value": types_1.Rank.Low,
                                "text": {
                                    "type": "plain_text",
                                    "text": types_1.Rank.Low
                                },
                                "description": PRIORITY_DESCRIPTIONS[types_1.Rank.Low]
                            },
                            {
                                "value": types_1.Rank.High,
                                "text": {
                                    "type": "plain_text",
                                    "text": types_1.Rank.High,
                                },
                                "description": PRIORITY_DESCRIPTIONS[types_1.Rank.High]
                            },
                            {
                                "value": types_1.Rank.Critical,
                                "text": {
                                    "type": "plain_text",
                                    "text": types_1.Rank.Critical,
                                },
                                "description": PRIORITY_DESCRIPTIONS[types_1.Rank.Critical]
                            }
                        ]
                    }
                }
            ]
        }
    };
    console.log('sending payload:', JSON.stringify(payload));
    return axios.post(SLACK_URLS.OPEN_VIEWS, payload, { headers });
};
const handleBlockAction = (payload) => {
    console.log('received block action payload:', JSON.stringify(payload));
    if (payload.actions[0].action_id === types_1.ACTION_TYPES.RankIssue) {
        // store the rank temporarily. if another action comes in with type "view_submission", we'll read from state before updating the database with the user's selection in that view.
        state.ranks[payload.view.id] = payload.actions[0].selected_option.text.text;
        console.log('updated state:', JSON.stringify(state));
    }
};
const handleMessageAction = (payload) => {
    const { message, response_url: responseURL, trigger_id: triggerID, type, user } = payload;
    state.messages[user.id] = message;
    openModal(triggerID, user.id).then((resp) => {
        // update state with the view id for the modal. this way we know which view the user is looking at.
        state.views[user.id] = resp.data.view.id;
    }).catch(err => console.log('failed to open modal:', err));
};
const handleViewSubmission = (payload) => {
    const { view: { id: viewID }, user: { id: userID } } = payload;
    const issue = {
        rank: state.ranks[viewID],
        message: state.messages[userID],
    };
    console.log('send issue to the db:', issue);
    // TODO integrate with firestore!
    // may need this if we decide not to send the acknowledgement 200 response until we have written to the db. otherwise the view closes as soon as the acknowledgment is received by slack.
    // const closeModalPayload = {
    //
    // }
    // axios.post(SLACK_URLS.UPDATE_VIEWS, {
    //
    // }, { headers });
};
// handleRequest is the main entry point to the carebear message action.
const handleRequest = (req, res) => {
    const payload = JSON.parse(req.body.payload);
    const authenticated = verifyToken(payload.token);
    if (authenticated) {
        // send acknowledgement response.
        res.sendStatus(200);
    }
    else {
        return res.sendStatus(401);
    }
    console.log('received payload', payload);
    switch (payload.type) {
        case types_1.PAYLOAD_TYPES.MessageActions:
            handleMessageAction(payload);
            break;
        case types_1.PAYLOAD_TYPES.BlockActions:
            handleBlockAction(payload);
            break;
        case types_1.PAYLOAD_TYPES.Submit:
            handleViewSubmission(payload);
        default: break;
    }
};
app.post('/carebear_create', handleRequest);
app.listen(port, () => {
    console.log(`Care bear is listening at http://localhost:${port}`);
});