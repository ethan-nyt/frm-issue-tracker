"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Statuses = exports.CallbackIDs = exports.TEXT_TYPES = exports.ACTION_TYPES = exports.PAYLOAD_TYPES = exports.Rank = void 0;
var Rank;
(function (Rank) {
    Rank["Low"] = "low";
    Rank["High"] = "high";
    Rank["Critical"] = "critical";
})(Rank = exports.Rank || (exports.Rank = {}));
var PAYLOAD_TYPES;
(function (PAYLOAD_TYPES) {
    PAYLOAD_TYPES["BlockActions"] = "block_actions";
    PAYLOAD_TYPES["MessageActions"] = "message_action";
    PAYLOAD_TYPES["Submit"] = "view_submission";
})(PAYLOAD_TYPES = exports.PAYLOAD_TYPES || (exports.PAYLOAD_TYPES = {}));
var ACTION_TYPES;
(function (ACTION_TYPES) {
    ACTION_TYPES["RankIssue"] = "rank-issue";
})(ACTION_TYPES = exports.ACTION_TYPES || (exports.ACTION_TYPES = {}));
var TEXT_TYPES;
(function (TEXT_TYPES) {
    TEXT_TYPES["PlainText"] = "plain_text";
    TEXT_TYPES["Markdown"] = "mrkdwn";
})(TEXT_TYPES = exports.TEXT_TYPES || (exports.TEXT_TYPES = {}));
var CallbackIDs;
(function (CallbackIDs) {
    CallbackIDs["CreateIssue"] = "create_issue";
    CallbackIDs["SetRank"] = "set_rank";
})(CallbackIDs = exports.CallbackIDs || (exports.CallbackIDs = {}));
var Statuses;
(function (Statuses) {
    Statuses["Backlog"] = "backlog";
})(Statuses = exports.Statuses || (exports.Statuses = {}));
