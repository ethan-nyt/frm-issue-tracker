import env from "dotenv";
import express from "express";
import cors from "cors";
import axios from "axios";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import redis from "redis";
import {
  ACTION_TYPES,
  BlockActionPayload,
  CallbackIDs,
  Issue,
  Message,
  MessageActionPayload,
  PAYLOAD_TYPES,
  Rank,
  State,
  Statuses,
  ViewSubmissionPayload,
} from "./types";

env.config();
const app = express();
app.use(cors());
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

const cloud = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: "https://nyt-care-dev.firebaseio.com",
});
const db = cloud.firestore();

const headers = {
  Authorization: `Bearer ${process.env.BOT_ACCESS_TOKEN}`,
};

const SLACK_URLS = {
  OPEN_VIEWS: "https://slack.com/api/views.open",
  UPDATE_VIEWS: "https://slack.com/api/views.update",
  GET_USER: "https://slack.com/api/users.info",
  POST_MESSAGE: "https://slack.com/api/chat.postMessage",
};

const PRIORITY_DESCRIPTIONS = {
  [Rank.Low]: {
    type: "plain_text",
    text:
      "This issue is not your top priority - only look into it if there are no higher priority tasks in the backlog.",
  },
  [Rank.High]: {
    type: "plain_text",
    text: "This issue should be handled as soon as possible.",
  },
  [Rank.Critical]: {
    type: "plain_text",
    text: "This issue requires immediate action.",
  },
};

const FIREBASE_COLLECTION = "care-bear";
const REDIS_KEY = "care-bear-redis-123456789";

// slack POST requests are URL encoded, but the "payload" key is JSON.
app.use(bodyParser.urlencoded({ extended: true }));
const redisClient = redis.createClient(7001, process.env.REDIS_HOST);
redisClient.on("error", (err: any) => console.error("ERR:REDIS:", err));
redisClient.on('ready', () => {
  console.log("going to try hitting redis");
  const payload = {
    ranks: { "123": "1234567" },
    views: { "123": "23456" },
    messages: { "123": { x: 1 } },
  };
  redisClient.set(REDIS_KEY, JSON.stringify(payload), (err: any, res: any) => {
    if (err) {
      console.log("got an error back from redis:", err);
    } else {
      console.log("success response from redis:", res);
    }
  });
});

// look into gcp memory store
// TODO move this state management to another piece of infrastructure. this might not work if there were multiple instances of the app server with a load balancer. Also if this were on a separate piece of infrastructure, could go serverless.
// the server needs some state in order to track a user's interactions with views that the app opens dynamically within slack.
const state: State = {
  // ranks is a map of view id's to the last selected rank in that view.
  ranks: {},
  // messages is a map of user id's (the ID for the user who clicked "create an issue") to message objects.
  messages: {},
  // views is a map of user id's to the view that user is currently looking at.
  views: {},
};

// TODO define type for the resolved promise value here
const getUser = (userID: string): Promise<any> => {
  return axios.get(`${SLACK_URLS.GET_USER}?user=${userID}`, {
    headers: {
      ...headers,
      "content-type": "application/x-www-form-urlencoded",
    },
  });
};

const verifyToken = (token: string): boolean => {
  return token === process.env.VERIFICATION_TOKEN;
};

const isThreadedReplyMessage = (message: Message) => {
  // if there is no thread_ts field, message is not part of a thread
  if (!message.thread_ts) return false;
  // if the thread_ts equals the ts, message is the parent message in a thread
  if (message.thread_ts === message.ts) return false;
  // if neither of above cases hold, message is a "reply" in a thread.
  return true;
};

const postMessage = (channelID: string, threadTS: string, text: string) => {
  return axios.post(
    SLACK_URLS.POST_MESSAGE,
    { channel: channelID, thread_ts: threadTS, text },
    { headers }
  );
};

const openModal = (triggerID: string, userID: string): Promise<any> => {
  const payload = {
    trigger_id: triggerID,
    callback_id: CallbackIDs.SetRank,
    view: {
      private_metadata: userID, // pass the UserID here so that when the modal opens we will have access to the viewID the user is looking at and we will be able to close it onclick of the submit button.
      type: "modal",
      title: {
        type: "plain_text",
        text: "Care Bear 🐻❤️🧡💛💚💙💜🖤🐻",
        emoji: true,
      },
      submit: {
        type: "plain_text",
        text: "Submit",
        emoji: true,
      },
      close: {
        type: "plain_text",
        text: "Cancel",
        emoji: true,
      },
      blocks: [
        {
          type: "section",
          text: {
            type: "plain_text",
            text: "How would you rank this issue?",
          },
          accessory: {
            type: "radio_buttons",
            action_id: ACTION_TYPES.RankIssue,
            options: [
              {
                value: Rank.Low,
                text: {
                  type: "plain_text",
                  text: Rank.Low,
                },
                description: PRIORITY_DESCRIPTIONS[Rank.Low],
              },
              {
                value: Rank.High,
                text: {
                  type: "plain_text",
                  text: Rank.High,
                },
                description: PRIORITY_DESCRIPTIONS[Rank.High],
              },
              {
                value: Rank.Critical,
                text: {
                  type: "plain_text",
                  text: Rank.Critical,
                },
                description: PRIORITY_DESCRIPTIONS[Rank.Critical],
              },
            ],
          },
        },
      ],
    },
  };
  return axios.post(SLACK_URLS.OPEN_VIEWS, payload, { headers });
};

const handleBlockAction = (payload: BlockActionPayload) => {
  if (payload.actions[0].action_id === ACTION_TYPES.RankIssue) {
    // store the rank temporarily. if another action comes in with type "view_submission", we'll read from state before updating the database with the user's selection in that view.
    state.ranks[payload.view.id] = payload.actions[0].selected_option.text.text;
  }
};

const handleMessageAction = (payload: MessageActionPayload) => {
  const {
    message,
    channel,
    trigger_id: triggerID,
    type,
    user: reportingUser,
  } = payload;
  const authorID = message.user;
  if (isThreadedReplyMessage(message)) {
    throw new Error("this feature does not work with threaded reply messages.");
  }
  getUser(authorID).then((resp) => {
    state.messages[reportingUser.id] = {
      ...message,
      channel,
      team_id: resp.data.user.team_id,
      name: resp.data.user.real_name,
      username: resp.data.user.name,
    };
    openModal(triggerID, reportingUser.id)
      .then((resp) => {
        // update state with the view id for the modal. this way we know which view the user is looking at.
        state.views[reportingUser.id] = resp.data.view.id;
      })
      .catch((err) => console.log("failed to open modal:", err));
  });
};

const handleViewSubmission = (payload: ViewSubmissionPayload) => {
  const {
    view: { id: viewID },
    user: { id: userID },
    trigger_id: triggerID,
  } = payload;
  getUser(userID)
    .then((resp) => {
      const newDocRef = db.collection(FIREBASE_COLLECTION).doc();
      const reportingUser = resp.data.user;
      const issue: Issue = {
        id: newDocRef.id,
        rank: state.ranks[viewID],
        message: state.messages[reportingUser.id],
        reportingUser: {
          id: reportingUser.id,
          name: reportingUser.real_name,
          username: reportingUser.name,
          team_id: reportingUser.team_id,
        },
        status: Statuses.Backlog, // this field will be used on the UI to place the item in the appropriate column.
      };
      newDocRef
        .set(issue)
        .then(() => {
          postMessage(
            issue.message.channel.id,
            issue.message.ts,
            "An issue has been created in response to this message. The engineer-on-call will look into it ASAP!"
          )
            .then(() => console.log("posted message successfully"))
            .catch((err: any) => console.log("failed to post message:", err));
        })
        .catch((err) => {
          console.log(
            "failed to create issue in firestore. now plz let the user know an issue was not created."
          );
        });
    })
    .catch(console.error);

  // may need this if we decide not to send the acknowledgement 200 response until we have written to the db. otherwise the view closes as soon as the acknowledgment is received by slack.
  // const closeModalPayload = {
  //
  // }
  // axios.post(SLACK_URLS.UPDATE_VIEWS, {
  //
  // }, { headers });
};

// handleRequest is the main entry point to the carebear message action.
const createIssue = (req: any, res: any) => {
  const payload = JSON.parse(req.body.payload);
  const authenticated = verifyToken(payload.token);
  if (authenticated) {
    // send acknowledgement response.
    res.status(200).send();
  } else {
    return res.sendStatus(401);
  }
  console.log("received payload", JSON.stringify(payload));
  switch (payload.type) {
    case PAYLOAD_TYPES.MessageActions:
      handleMessageAction(payload);
      break;
    case PAYLOAD_TYPES.BlockActions:
      handleBlockAction(payload);
      break;
    case PAYLOAD_TYPES.Submit:
      handleViewSubmission(payload);
    default:
      break;
  }
};

const getIssues = (req: any, res: any) => {
  // check for custom header passed from care-bear-ui
  const authenticated = verifyToken(req.headers["slack-verification-token"]);
  if (!authenticated) {
    res.sendStatus(401);
  } else {
    db.collection(FIREBASE_COLLECTION)
      .get()
      .then((snapshot: any) => {
        const docs = snapshot.docs.map((doc: any) => doc.data());
        res.send(docs);
      });
  }
};

const updateIssue = (req: any, res: any) => {
  const authenticated = verifyToken(req.headers["slack-verification-token"]);
  if (!authenticated) {
    res.sendStatus(401);
  }
  db.collection(FIREBASE_COLLECTION)
    .doc(req.body.updatedIssue.id)
    .update(req.body.updatedIssue)
    .then(() => {
      res.send("success");
    })
    .catch((err) => {
      console.log("error trying to update issue:", err);
      res.sendStaus(500);
    });
};

const deleteIssue = (req: any, res: any) => {
  const authenticated = verifyToken(req.headers["slack-verification-token"]);
  if (!authenticated) {
    res.sendStatus(401);
  }
  db.collection(FIREBASE_COLLECTION)
    .doc(req.body.id)
    .delete()
    .then(() => {
      res.send("success");
    })
    .catch((err) => {
      console.log("error trying to delete issue:", err);
      res.sendStatus(500);
    });
};

app.get("/", (req: any, res: any) => {
  res.status(200).send("care bear is alive and well!");
});

app.post("/create", createIssue);
app.post("/update", bodyParser.json(), updateIssue);
app.post("/delete", bodyParser.json(), deleteIssue);
app.get("/issues", getIssues);

app.listen(port, () => {
  console.log(`Care bear is listening at http://localhost:${port}`);
});
