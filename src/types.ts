export enum Rank {
    Low = "low",
    High = "high",
    Critical = "critical"
}

export interface RankMap {
    [ViewID: string]: keyof typeof Rank
}

// The message object from slack has a lot of other fields, ex. uploaded file objects, blocks for rich text rendering, etc. may be useful in the future
export interface Message {
    text: string,
    type: string,
    user: string, // the author's ID
    name: string, // the author's name
    team_id: string, // the author's team ID
    username: string, // the author's username
    channel: Channel,
    [x: string]: any // catch-all for other message properties we dont care about yet.
}

export interface MessageMap {
    [key: string]: Message
}

export interface ViewMap {
    [UserID: string]: string
}

export interface State {
    // ranks is a map of view id's to the last selected rank in that view.
    ranks: RankMap,
    // messages is a map of user id's (the ID for the user who clicked "create an issue") to message objects.
    messages: MessageMap,
    // views is a map of user id's to the view that user is currently looking at.
    views: ViewMap,
}

export enum PAYLOAD_TYPES {
    BlockActions = 'block_actions',
    MessageActions = 'message_action',
    Submit = "view_submission"
}

export enum ACTION_TYPES {
    RankIssue = "rank-issue",
}

export enum TEXT_TYPES {
    PlainText = "plain_text",
    Markdown = "mrkdwn",
}


export interface Team {
    id: string,
    domain: string,
    enterprise_id: string,
    enterprise_name: string
}

export interface User {
    id: string,
    username: string,
    team_id: string,
    name: string,
}

export interface Channel {
    id: string,
    name: string,
}

export interface View {
    id: string,
    team_id: string,
    type: string,
    blocks: [any],
    private_metadata: string,
    callback_id: string,
    state: any,
    hash: string,
    title: { type: keyof typeof TEXT_TYPES, text: string, emoji: boolean }
    [x: string]: any // catch-all for additional fields we don't use yet
}

export enum CallbackIDs {
    CreateIssue = "create_issue", // the slack app is configured to use this callback_id when the message action "create a task" fires.
    SetRank = 'set_rank',
}

export interface MessageActionPayload {
    type: PAYLOAD_TYPES.MessageActions,
    token: string,
    action_ts: string,
    team: Team,
    user: User,
    channel: Channel,
    callback_id: keyof typeof CallbackIDs,
    trigger_id: string,
    response_url: string,
    message_ts: string,
    message: Message
    [x: string]: any // catch-all for additional fields we don't use yet.
}

// note: radio buttons will send a different shape payload than checkbox or other types of interaction payloads.
export interface RadioAction {
    selected_option: {text: {text: keyof typeof Rank}},
    action_id: string
}

export interface BlockActionPayload {
    type: PAYLOAD_TYPES.BlockActions,
    actions: [RadioAction],
    user: User,
    team: Team,
    view: View,
    [x: string]: any // catch-all for additional fields we don't use yet
}

export interface ViewSubmissionPayload {
    view: View,
    user: User
}

export interface Issue {
    rank: keyof typeof Rank,
    message: Message,
    reportingUser: User
}