"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const cloud = firebase_admin_1.default.initializeApp({
    credential: firebase_admin_1.default.credential.applicationDefault(),
    databaseURL: 'https://nyt-care-dev.firebaseio.com'
});
const db = cloud.firestore();
const types_1 = require("./types");
const headers = {
    Authorization: `Bearer ${process.env.BOT_ACCESS_TOKEN}`
};
const SLACK_URLS = {
    OPEN_VIEWS: 'https://slack.com/api/views.open',
    UPDATE_VIEWS: 'https://slack.com/api/views.update',
    GET_USER: 'https://slack.com/api/users.info'
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
const FIREBASE_COLLECTION = 'care-bear';
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
// TODO define type for the resolved promise value here
const getUser = (userID) => {
    return axios.get(`${SLACK_URLS.GET_USER}?user=${userID}`, { headers: Object.assign(Object.assign({}, headers), { 'content-type': 'application/x-www-form-urlencoded' }) });
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
    return axios.post(SLACK_URLS.OPEN_VIEWS, payload, { headers });
};
const handleBlockAction = (payload) => {
    if (payload.actions[0].action_id === types_1.ACTION_TYPES.RankIssue) {
        // store the rank temporarily. if another action comes in with type "view_submission", we'll read from state before updating the database with the user's selection in that view.
        state.ranks[payload.view.id] = payload.actions[0].selected_option.text.text;
    }
};
const handleMessageAction = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { message, channel, trigger_id: triggerID, type, user: reportingUser } = payload;
    const authorID = message.user;
    getUser(authorID).then(resp => {
        state.messages[reportingUser.id] = {
            channel,
            text: message.text,
            type: message.type,
            user: message.user,
            team_id: resp.data.user.team_id,
            name: resp.data.user.real_name,
            username: resp.data.user.name
        };
        openModal(triggerID, reportingUser.id).then((resp) => {
            // update state with the view id for the modal. this way we know which view the user is looking at.
            state.views[reportingUser.id] = resp.data.view.id;
        }).catch(err => console.log('failed to open modal:', err));
    });
});
const handleViewSubmission = (payload) => {
    const { view: { id: viewID }, user: { id: userID } } = payload;
    getUser(userID).then((resp) => {
        const reportingUser = resp.data.user;
        const issue = {
            rank: state.ranks[viewID],
            message: state.messages[reportingUser.id],
            reportingUser: {
                id: reportingUser.id,
                name: reportingUser.real_name,
                username: reportingUser.name,
                team_id: reportingUser.team_id,
            }
        };
        db.collection(FIREBASE_COLLECTION).add(issue).then(() => console.log('successfully created issue in firestore')).catch(console.error);
    }).catch(console.error);
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
        res.status(200).send();
    }
    else {
        return res.sendStatus(401);
    }
    console.log('received payload', JSON.stringify(payload));
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
