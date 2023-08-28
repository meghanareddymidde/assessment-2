const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost");
    });
  } catch (error) {
    console.log(`DB Error : ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//API 1
app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  console.log(hashedPassword);
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUser = `
            INSERT INTO user(username,password,name,gender)
            VALUES (
                '${username}',
                '${hashedPassword}',
                '${name}',
                '${gender}'
            );
            `;
      const dbResponse = await db.run(createUser);
      const userId = dbResponse.lastID;
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "Twitter");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "Twitter", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/profile/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await db.get(selectUserQuery);
  response.send(userDetails);
});

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getLoggedInUserId = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
  const loggedInUser = await db.get(getLoggedInUserId);
  //console.log(loggedInUser);

  const getFollowingUserId = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${loggedInUser.user_id};
    `;
  const followingUserIdArray = await db.all(getFollowingUserId);
  //console.log(followingUserIdArray);

  let getTweets;

  followingUserIdArray.map((eachId) => {
    console.log(eachId);
    getTweets = `
    SELECT user.username AS username,
    tweet.tweet As tweet,
    tweet.date_time As dateTime 
    FROM  user INNER JOIN tweet ON user.user_id = tweet.user_id 
    WHERE tweet.user_id = ${eachId.following_user_id}
    ORDER BY dateTime ASC 
    LIMIT 4 
    OFFSET 0;
    `;
  });
  const tweetsArray = await db.all(getTweets);
  response.send(tweetsArray);
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getLoggedInUserId = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
  const loggedInUser = await db.get(getLoggedInUserId);
  //console.log(loggedInUser);

  const getFollowingUserId = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${loggedInUser.user_id};
    `;
  const followingUserIdArray = await db.all(getFollowingUserId);
  //console.log(followingUserId);

  let getFollowingName;

  followingUserIdArray.map((eachId) => {
    getFollowingName = `
  SELECT name FROM user 
  WHERE user_id = ${eachId.following_user_id};
  `;
  });
  const namesArray = await db.all(getFollowingName);
  response.send(namesArray);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getLoggedInUserId = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
  const loggedInUser = await db.get(getLoggedInUserId);
  //console.log(loggedInUser);

  const getFollowerUserId = `
    SELECT follower_user_id FROM follower 
    WHERE following_user_id = ${loggedInUser.user_id};
    `;
  const followerUserIdArray = await db.all(getFollowerUserId);

  let getFollowersNames;

  followerUserIdArray.map((eachId) => {
    getFollowersNames = `
     SELECT name FROM user 
     WHERE user_id = ${eachId.follower_user_id};
     `;
  });
  const namesArray = await db.all(getFollowersNames);
  response.send(namesArray);
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getLoggedInUserId = `
    SELECT user_id FROM user WHERE username = '${username}';
    `;
  const loggedInUser = await db.get(getLoggedInUserId);

  const getFollowingUserId = `
  SELECT following_user_id FROM follower 
  WHERE follower_user_id = ${loggedInUser.user_id};
  `;
  const followingUserId = db.get(getFollowingUserId);

  if (followingUserId !== undefined) {
    const getFollowingUserTweets = `
  SELECT tweet.tweet,
  COUNT(like.like_id) AS likes,
  COUNT(reply.reply) AS replies,
  tweet.date_time AS dateTime
  FROM (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T 
  INNER JOIN like ON T.tweet_id = like.tweet_id
  WHERE tweet.tweet_id = ${tweetId};
  `;
    const tweets = await db.all(getFollowingUserTweets);
    response.send(tweets);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
