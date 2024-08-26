const express = require("express");
const app = express();
const http = require("http");
const cors = require ("cors");

const bodyParser = require('body-parser');
const { google } = require('googleapis');
const credentials = require('./credentials.json');
const { simpleParser } = require('mailparser');
const tokens = require('./token.json')

const { Server } = require("socket.io");

const nodemailer = require("nodemailer");
const multer = require('multer')
const upload = multer({ dest: 'uploads/' });

require('dotenv').config();


const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;
const outgoingApplicationSid = process.env.OUTGOING_APPLICATION_SID;

const AccessToken = require('twilio').jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;


app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const server = http.createServer(app);

const auth = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    'http://localhost:3001'
);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'iralphbaluyot@gmail.com',
    pass: 'hyfevmvmngnibtov'
  }
});

//Chat
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
    },
});

io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on("join_chat", (data) => {
        socket.join(data);
        console.log(`User with ID: ${socket.id} joined the chat: ${data}`)
    })

    socket.on('send_message', (msg) => {
        io.emit('receive_message', msg);

    });

    socket.on("disconnect", () => {
        console.log("User Disconnected", socket.id);
    });
});

// Generate Token for call
function generateToken(identity) {
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: outgoingApplicationSid,
    incomingAllow: true,  // Allow incoming calls
  });

  const token = new AccessToken(accountSid, apiKey, apiSecret, {identity});
  token.addGrant(voiceGrant);
  token.identity = identity;
  console.log(token.identity);
  return token.toJwt();
}

const twilio = require('twilio');

app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say('You have an incoming call');
  twiml.dial({
    callerId: process.env.TWILIO_PHONE_NUMBER,
  }).client('default_user');  // Use the identity you want to forward the call to

  res.type('text/xml');
  res.send(twiml.toString());
});

// Example route in an Express server
app.get('/token', (req, res) => {
  const identity = req.query.identity || 'default_user';
  const token = generateToken(identity);
  res.send({ token });
});

//SMS

const client = require('twilio')(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Endpoint to send SMS
app.post('/send-sms', (req, res) => {
    const { to, message } = req.body;

    client.messages
        .create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: to,
        })
        .then((message) => res.json({ success: true, sid: message.sid }))
        .catch((error) => res.status(500).json({ success: false, error: error.message }));
});

// In-memory store for messages
let inboxMessages = [];

// Twilio webhook to receive incoming SMS
app.post('/inbox-messages', (req, res) => {
  const from = req.body.From;
  const body = req.body.Body;
  const timestamp = new Date();

  // Store incoming message in the inboxMessages array
  inboxMessages.push({ from, body, timestamp });

  // Respond to Twilio to confirm receipt
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});

// Endpoint to fetch all received messages
app.get('/inbox-messages', (req, res) => {
  res.json({ messages: inboxMessages });
});

//EMAIL
// Load token or redirect to auth URL
auth.setCredentials(tokens);

// Create Gmail client
const gmail = google.gmail({version: 'v1', auth});

// Fetching emails
app.get('/email', async (req, res) => {
    try {
        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 3,
        });

        const emailPromises = response.data.messages.map(async (message) => {
            const email = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
                format: 'raw',
            });
            
            // console.log(email);
            
            const parsedEmail = await simpleParser(Buffer.from(email.data.raw, 'base64'));  // Correct parsing

            // console.log("Parsed Email: ", parsedEmail);

            const attachments = parsedEmail.attachments.map((attachment) => ({
                filename: attachment.filename,
                contentType: attachment.contentType,
                size: attachment.size,
                headers: attachment.headers,
                attachmentId: attachment.contentId, // This might need to be `attachment.cid` depending on your usage
            }));
            
            console.log(attachments);
            
            // Ensure you're passing the correct Gmail API messageId (`message.id`) here.
            return {
                gmailMessageId: message.id,  // Correct Gmail API messageId for API operations
                subject: parsedEmail.subject,
                from: parsedEmail.from.value,
                text: parsedEmail.text,
                html: parsedEmail.html,
                parsedMessageId: parsedEmail.messageId,  // Email header's Message-ID, if needed
                attachments,
            };
        });

        const emails = await Promise.all(emailPromises);
        res.json({ emails });
    } catch (error) {
        console.error('Error fetching emails: ', error);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
});

app.get('/download-attachment', async (req, res) => {
  console.log
  const { messageId, attachmentId, filename } = req.query;

  if (!messageId || !attachmentId || !filename) {
    return res.status(400).json({ error: 'Missing required query parameters' });
  }

  try {
    // Fetch the attachment from Gmail
    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: messageId,
      id: attachmentId,
    });

    const attachmentData = response.data.data;

    // Convert from base64url (web-safe) to base64
    const attachmentBuffer = Buffer.from(attachmentData, 'base64');

    // Set appropriate headers for file download
    res.set({
      'Content-Disposition': `attachment; filename=${filename}`,
      'Content-Type': 'application/octet-stream',
    });

    res.send(attachmentBuffer);
  } catch (error) {
    console.error('Error downloading attachment:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

app.post('/send-email', upload.array('attachments'), async (req, res) => {
  const { subject, body, to } = req.body;
  const attachments = req.files.map(file => ({
    filename: file.originalname,
    path: file.path,
    contentType: file.mimetype,
  }));

  const mailOptions = {
    from: 'iralphbaluyot@gmail.com',
    to,
    subject,
    text: body,
    attachments,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      return res.status(500).json({ message: 'Error sending email', error });
    } else {
      console.log('Email sent:', info.response);
      return res.status(200).json({ message: 'Email sent successfully', info });
    }
  });
});

server.listen(3001, () => {
    console.log("SERVER RUNNING")
})