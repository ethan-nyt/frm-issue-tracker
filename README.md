# Setup
- Install dependencies: `npm install`
- Run: `npm start`

# Local Development
- Create a file `.env` and add the following keys (all values are in vault): VERIFICATION_TOKEN, BOT_ACCESS_TOKEN, GOOGLE_APPLICATION_CREDENTIALS (in vault this is called FIREBASE_SERVICE_ACCOUNT_KEY, the value needs to be stored in a local json file, and the value for this key in .env should be the path to this json file)
- spin up a local redis instance with docker: `docker run --name care-bear-redis -p 7001:6379 -d redis`. You should then be able to connect to redis at `localhost:7001`
- Use `ngrok` to create a tunnel to `localhost:3000`. Then update the request URL in the slack api under "interactivity" to `<ngrok_output_url>/create`
- Compile typescript down to js and run the server using `npm start`

# Deployment
- run `npm run compile` followed by `gcloud app deploy`. the file `app.yaml` tells app engine what to do from there.
