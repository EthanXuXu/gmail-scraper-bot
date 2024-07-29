const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');
const { chromium } = require('playwright');
const inputUrlsJson = require('./resources/inputURLs.json')
const usedUrlsJson = require('./resources/usedURLs.json')
const usedEmailsJson = require('./resources/usedEmails.json')

// If modifying these scopes, delete token.json.
const SCOPES = [     
    'https://mail.google.com/',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.send'
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

async function main() {
    const browser = await chromium.launch({
        headless: false
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    let emails = []

    const urls = inputUrlsJson.urls

    for (const url of urls) {
        await page.goto(url, {
            waitUntil: "domcontentloaded",
        });
    
        const extractedText = await page.$eval('*', (el) => el.innerText);
        const currentSiteEmails = extractedText.match(/[A-Za-z0-9]+@[A-Za-z0-9]+\.[A-Za-z0-9]+/g);
        emails.push(...currentSiteEmails)    
    }

    emails = [...new Set(emails)]
    console.log(emails)
    emails = ['ethanx4321@gmail.com']
    usedUrlsJson.urls.push(...urls)
    await fs.writeFile(`${__dirname}/resources/usedURLs.json`, JSON.stringify(usedUrlsJson))
    await sendEmails(emails)
    await browser.close();
}

async function sendEmails(emails) {
    const auth = await authorize();
    const gmail = google.gmail({version: 'v1', auth})
    const subject = 'Hello';
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    for (const email of emails) {
        const messageParts = [
        `To: ${email}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${utf8Subject}`,
        '',
        'Sign me as a QE or bend over.',
        ];

        const message = messageParts.join('\n');
        const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    
        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
            raw: encodedMessage,
            },
        });
        console.log(res.data);
    }
    
    usedEmailsJson.emails.push(...emails)
    await fs.writeFile(`${__dirname}/resources/inputURLs.json`, JSON.stringify({urls:[]}))
    await fs.writeFile(`${__dirname}/resources/usedEmails.json`, JSON.stringify(usedEmailsJson))
}

main();
