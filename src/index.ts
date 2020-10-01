require('dotenv').config()
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

import {
    State,
    PAYLOAD_TYPES,
    CallbackIDs,
    Rank,
    MessageActionPayload,
    Message,
    MessageMap,
    ACTION_TYPES,
    BlockActionPayload, ViewSubmissionPayload, Issue
} from './types'

const headers = {
    Authorization: `Bearer ${process.env.BOT_ACCESS_TOKEN}`
};

const SLACK_URLS = {
    OPEN_VIEWS: 'https://slack.com/api/views.open',
    UPDATE_VIEWS: 'https://slack.com/api/views.update',
};

const PRIORITY_DESCRIPTIONS = {
    [Rank.Low]: {
        type: 'plain_text',
        text: "This issue is not your top priority - only look into it if there are no higher priority tasks in the backlog."
    },
    [Rank.High]: {
        type: 'plain_text',
        text: "This issue should be handled as soon as possible.",
    },
    [Rank.Critical]: {
        type: 'plain_text',
        text: "This issue requires immediate action."
    },
};

// slack POST requests are URL encoded, but the "payload" key is JSON.
app.use(bodyParser.urlencoded({ extended: true }));

// the server needs some state in order to track a user's interactions with views that the app opens dynamically within slack.
const state: State = {
    // ranks is a map of view id's to the last selected rank in that view.
    ranks: {},
    // messages is a map of user id's (the ID for the user who clicked "create an issue") to message objects.
    messages: {},
    // views is a map of user id's to the view that user is currently looking at.
    views: {},
};

const verifyToken = (token: string): boolean => {
    return token === process.env.VERIFICATION_TOKEN;
};

const openModal = (triggerID: string, userID: string): Promise<any> => {
    const payload = {
        "trigger_id": triggerID,
        "callback_id": CallbackIDs.SetRank,
        "view": {
            "private_metadata": userID, // pass the UserID here so that when the modal opens we will have access to the viewID the user is looking at and we will be able to close it onclick of the submit button.
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
                        "action_id": ACTION_TYPES.RankIssue,
                        "options": [
                            {
                                "value": Rank.Low,
                                "text": {
                                    "type": "plain_text",
                                    "text": Rank.Low
                                },
                                "description": PRIORITY_DESCRIPTIONS[Rank.Low]
                            },
                            {
                                "value": Rank.High,
                                "text": {
                                    "type": "plain_text",
                                    "text": Rank.High,
                                },
                                "description": PRIORITY_DESCRIPTIONS[Rank.High]
                            },
                            {
                                "value": Rank.Critical,
                                "text": {
                                    "type": "plain_text",
                                    "text": Rank.Critical,
                                },
                                "description": PRIORITY_DESCRIPTIONS[Rank.Critical]
                            }
                        ]
                    }
                }
            ]
        }
    }

    console.log('sending payload:', JSON.stringify(payload));

    return axios.post(SLACK_URLS.OPEN_VIEWS, payload, { headers });
};

const handleBlockAction = (payload: BlockActionPayload) => {
    console.log('received block action payload:', JSON.stringify(payload));
    if (payload.actions[0].action_id === ACTION_TYPES.RankIssue) {
        // store the rank temporarily. if another action comes in with type "view_submission", we'll read from state before updating the database with the user's selection in that view.
        state.ranks[payload.view.id] = payload.actions[0].selected_option.text.text;
        console.log('updated state:', JSON.stringify(state));
    }
};

const handleMessageAction = (payload: MessageActionPayload) => {
    const { message, response_url: responseURL, trigger_id: triggerID, type, user } = payload;
    state.messages[user.id] = message;
    openModal(triggerID, user.id).then((resp) => {
        // update state with the view id for the modal. this way we know which view the user is looking at.
        state.views[user.id] = resp.data.view.id;
    }).catch(err => console.log('failed to open modal:', err));
};

const handleViewSubmission = (payload: ViewSubmissionPayload) => {
    const { view: { id: viewID }, user: { id: userID } } = payload;
    const issue: Issue = {
        rank: state.ranks[viewID],
        message: state.messages[userID],
    }
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
const handleRequest = (req: any, res: any) => {
    const payload = JSON.parse(req.body.payload);
    const authenticated = verifyToken(payload.token);
    if (authenticated) {
        // send acknowledgement response.
        res.sendStatus(200);
    } else {
        return res.sendStatus(401);
    }
    console.log('received payload', payload);
    switch (payload.type) {
        case PAYLOAD_TYPES.MessageActions:
            handleMessageAction(payload);
            break;
        case PAYLOAD_TYPES.BlockActions:
            handleBlockAction(payload);
            break;
        case PAYLOAD_TYPES.Submit:
            handleViewSubmission(payload);
        default: break;
    }
};

app.post('/carebear_create', handleRequest);

app.listen(port, () => {
    console.log(`Care bear is listening at http://localhost:${port}`)
});