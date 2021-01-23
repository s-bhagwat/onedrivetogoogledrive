const puppeteer = require("puppeteer");

const OAuth2Data = require("./credentials.json");
const { google } = require("googleapis");
const express = require("express");
const path = require("path");
const app = express();

const fs = require("fs");

//handle the authentication
const CLIENT_ID = OAuth2Data.web.client_id;
const CLIENT_SECRET = OAuth2Data.web.client_secret;
const REDIRECT_URL = OAuth2Data.web.redirect_uris[1];

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URL
);

let name, pic;
let authed = false;
let scopes =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

const pupDownFunc = async (url) => {
  try {
    //     const browser = await puppeteer.launch({
    // args: [
    //   '--no-sandbox',
    //   '--disable-setuid-sandbox',
    // ],
    // });
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(0);
    await page.goto(url, { timeout: 0 });
    await page._client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: "./tmp",
    });
    await page.waitForSelector("[name='Download']");
    await page.click("[name='Download']");
    await page.waitForNavigation({ waitUntil: "networkidle0" });
    await browser.close();
  } catch (err) {
    console.log(err);
  }
};

app.get("/", (req, res) => {
  if (!authed) {
    //generate a auth url
    let url = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
    });
    res.render("index", { url: url });
  } else {
    //user is authenticated
    let oauth2 = google.oauth2({
      auth: oAuth2Client,
      version: "v2",
    });
    oauth2.userinfo.get((err, response) => {
      if (err) throw err;
      console.log(response.data);
      name = response.data.name;
      pic = response.data.picture;
      res.render("success", { name: name, pic: pic });
    });
  }
});
app.get("/upload", (req, res) => {
  res.redirect("/");
});
app.post("/upload", async (req, res) => {
  //torrent downloading code
  const drive = google.drive({
    version: "v3",
    auth: oAuth2Client,
  });
  const folderName = req.body.name;

  //code for creating a folder for storing videos
  let fileMetadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };

  /* Puppeteer downloading code */

  try {
    await pupDownFunc(req.body.link);
  } catch (err) {
    console.log(err);
  }

  const source = fs.createReadStream(path.join("tmp", req.body.videoName));

  drive.files.create(
    {
      resource: fileMetadata,
      fields: "id",
    },
    async function (err, folderMeta) {
      if (err) {
        // Handle error
        console.error(err);
      } else {
        console.log("Folder Id: ", folderMeta.data.id);

        const folderId = folderMeta.data.id;
        //when a folder is created then only start the downloading of the torrent

        let fileMetadata2 = {
          name: req.body.videoName,
          parents: [folderId],
        };

        async function main(fileMetadata2) {
          const res = await drive.files.create(
            {
              resource: fileMetadata2,
              // requestBody: {
              //   name: file.name,
              //   mimeType,
              // },
              media: {
                // mimeType: "application/vnd.google-apps.unknown",
                body: source,
              },
              fields: "id",
            },
            (err, data) => {
              if (err) throw err;
              console.log("Done uploading");
            }
          );
        }

        await main(fileMetadata2);
      }
    }
  );

  res.redirect("/");
});

app.get("/google/callback", (req, res) => {
  //exchange code with access token

  const code = req.query.code;
  if (code) {
    oAuth2Client.getToken(code, (err, tokens) => {
      if (err) throw err;
      console.log("successfully authenticated");

      oAuth2Client.setCredentials(tokens);
      authed = true;
      res.redirect("/");
    });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`server is listening on ${port}`);
});
