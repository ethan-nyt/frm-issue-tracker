"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const axios_1 = __importDefault(require("axios"));
const body_parser_1 = __importDefault(require("body-parser"));
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const types_1 = require("./types");
dotenv_1.default.config();
const app = express_1.default();
app.use(cors_1.default());
const port = 3000;
/**
 * TODOS:
 * 1. add a timestamp to the model for an issue (can this be done automatically in firebase?)
 * 2. research gcp memorystore and replace the state mgmt here with that if possible
 * --> then restructure all this code to prepare for serverless deployment on gcp cloud functions
 * 3. implement priority within rank
 * --> when creating an issue, put it at the bottom of the backlog, but this would allow users in the UI to reorder within each rank via drag/drop.
 * 4. When updating an issue, send another message to the thread describing the update (did someone change the status from backlog -> in progress? in progress -> done?)
 **/
const cloud = firebase_admin_1.default.initializeApp({
    credential: firebase_admin_1.default.credential.applicationDefault(),
    databaseURL: 'https://nyt-care-dev.firebaseio.com'
});
const db = cloud.firestore();
const headers = {
    Authorization: `Bearer ${process.env.BOT_ACCESS_TOKEN}`
};
const SLACK_URLS = {
    OPEN_VIEWS: 'https://slack.com/api/views.open',
    UPDATE_VIEWS: 'https://slack.com/api/views.update',
    GET_USER: 'https://slack.com/api/users.info',
    POST_MESSAGE: 'https://slack.com/api/chat.postMessage',
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
app.use(body_parser_1.default.urlencoded({ extended: true }));
// look into gcp memory store
// TODO move this state management to another piece of infrastructure. this might not work if there were multiple instances of the app server with a load balancer. Also if this were on a separate piece of infrastructure, could go serverless.
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
    return axios_1.default.get(`${SLACK_URLS.GET_USER}?user=${userID}`, { headers: Object.assign(Object.assign({}, headers), { 'content-type': 'application/x-www-form-urlencoded' }) });
};
const verifyToken = (token) => {
    return token === process.env.VERIFICATION_TOKEN;
};
const isThreadedReplyMessage = (message) => {
    // if there is no thread_ts field, message is not part of a thread
    if (!message.thread_ts)
        return false;
    // if the thread_ts equals the ts, message is the parent message in a thread
    if (message.thread_ts === message.ts)
        return false;
    // if neither of above cases hold, message is a "reply" in a thread.
    return true;
};
const postMessage = (channelID, threadTS, text) => {
    return axios_1.default.post(SLACK_URLS.POST_MESSAGE, { channel: channelID, thread_ts: threadTS, text }, { headers });
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
    return axios_1.default.post(SLACK_URLS.OPEN_VIEWS, payload, { headers });
};
const handleBlockAction = (payload) => {
    if (payload.actions[0].action_id === types_1.ACTION_TYPES.RankIssue) {
        // store the rank temporarily. if another action comes in with type "view_submission", we'll read from state before updating the database with the user's selection in that view.
        state.ranks[payload.view.id] = payload.actions[0].selected_option.text.text;
    }
};
const handleMessageAction = (payload) => {
    const { message, channel, trigger_id: triggerID, type, user: reportingUser } = payload;
    const authorID = message.user;
    if (isThreadedReplyMessage(message)) {
        throw new Error("this feature does not work with threaded reply messages.");
    }
    getUser(authorID).then(resp => {
        state.messages[reportingUser.id] = Object.assign(Object.assign({}, message), { channel, team_id: resp.data.user.team_id, name: resp.data.user.real_name, username: resp.data.user.name });
        openModal(triggerID, reportingUser.id).then((resp) => {
            // update state with the view id for the modal. this way we know which view the user is looking at.
            state.views[reportingUser.id] = resp.data.view.id;
        }).catch(err => console.log('failed to open modal:', err));
    });
};
const handleViewSubmission = (payload) => {
    const { view: { id: viewID }, user: { id: userID }, trigger_id: triggerID } = payload;
    getUser(userID).then((resp) => {
        const newDocRef = db.collection(FIREBASE_COLLECTION).doc();
        const reportingUser = resp.data.user;
        const issue = {
            id: newDocRef.id,
            rank: state.ranks[viewID],
            message: state.messages[reportingUser.id],
            reportingUser: {
                id: reportingUser.id,
                name: reportingUser.real_name,
                username: reportingUser.name,
                team_id: reportingUser.team_id,
            },
            status: types_1.Statuses.Backlog,
        };
        newDocRef.set(issue).then(() => {
            postMessage(issue.message.channel.id, issue.message.ts, "An issue has been created in response to this message. The engineer-on-call will look into it ASAP!").then(() => console.log('posted message successfully')).catch((err) => console.log('failed to post message:', err));
        }).catch((err) => {
            console.log('failed to create issue in firestore. now plz let the user know an issue was not created.');
        });
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
const createIssue = (req, res) => {
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
const getIssues = (req, res) => {
    // check for custom header passed from care-bear-ui
    const authenticated = verifyToken(req.headers['slack-verification-token']);
    if (!authenticated) {
        res.sendStatus(401);
    }
    else {
        db.collection(FIREBASE_COLLECTION).get().then((snapshot) => {
            const docs = snapshot.docs.map((doc) => doc.data());
            res.send(docs);
        });
    }
};
const updateIssue = (req, res) => {
    const authenticated = verifyToken(req.headers['slack-verification-token']);
    if (!authenticated) {
        res.sendStatus(401);
    }
    console.log('req.body.updatedIssue', req.body.updatedIssue);
    db.collection(FIREBASE_COLLECTION).doc(req.body.updatedIssue.id).update(req.body.updatedIssue).then(() => {
        res.send('success');
    }).catch(err => {
        console.log('error trying to update issue:', err);
        res.sendStaus(500);
    });
};
const deleteIssue = (req, res) => {
    const authenticated = verifyToken(req.headers['slack-verification-token']);
    if (!authenticated) {
        res.sendStatus(401);
    }
    db.collection(FIREBASE_COLLECTION).doc(req.body.id).delete().then(() => {
        res.send('success');
    }).catch(err => {
        console.log('error trying to delete issue:', err);
        res.sendStatus(500);
    });
};
app.get('/', (req, res) => {
    res.status(200).send('care bear is alive and well!');
});
app.post('/create', createIssue);
app.post('/update', body_parser_1.default.json(), updateIssue);
app.post('/delete', body_parser_1.default.json(), deleteIssue);
app.get('/issues', getIssues);
app.listen(port, () => {
    console.log(`Care bear is listening at http://localhost:${port}`);
});
