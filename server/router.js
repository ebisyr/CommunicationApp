const express = require('express');
const { tokenGenerator, voiceResponse } = require('./handler');

const router = express.Router();

// Route to generate Twilio token
router.get('/token', (req, res) => {
  try {
    const tokenData = tokenGenerator();
    res.status(200).json(tokenData); // Send token data as JSON with status 200
  } catch (error) {
    console.error('Error generating token:', error);
    res.status(500).json({ error: 'Failed to generate token' }); // Handle errors with status 500
  }
});

// Route to handle voice responses
router.post('/voice', (req, res) => {
  try {
    const twimlResponse = voiceResponse(req.body);
    res.set('Content-Type', 'text/xml');
    res.status(200).send(twimlResponse); // Send TwiML response with status 200
  } catch (error) {
    console.error('Error generating voice response:', error);
    res.status(500).send('<Response><Say>Sorry, an error occurred.</Say></Response>'); // Handle errors with status 500
  }
});

module.exports = router;
