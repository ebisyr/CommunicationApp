const VoiceResponse = require('twilio').twiml.VoiceResponse;
const AccessToken = require('twilio').jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

var identity;


const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;
const outgoingApplicationSid = process.env.OUTGOING_APPLICATION_SID;


exports.tokenGenerator = function tokenGenerator(identity = "default_user") {
  const accessToken = new AccessToken(
    accountSid,
    apiKey,
    apiSecret,
    { identity } // set the identity dynamically based on the argument
  );

  const grant = new VoiceGrant({
    outgoingApplicationSid: outgoingApplicationSid, // corrected from config.twimlAppSid
    incomingAllow: true,
  });

  accessToken.addGrant(grant);

  return {
    identity: identity,
    token: accessToken.toJwt(),
  };
};

exports.voiceResponse = function voiceResponse(requestBody) {
    const toNumberOrClientName = requestBody.To;
    const callerId = process.env.TWILIO_PHONE_NUMBER;
    const twiml = new VoiceResponse();
  
    if (toNumberOrClientName === callerId) {
      const dial = twiml.dial();
      dial.client(identity); // Connect the call to your Twilio Client
    } else if (requestBody.To) {
      const dial = twiml.dial({ callerId });
      const attr = isAValidPhoneNumber(toNumberOrClientName) ? 'number' : 'client';
      dial[attr]({}, toNumberOrClientName);
    } else {
      twiml.say('Thanks for calling!');
    }
  
    return twiml.toString();
  };
  

/**
 * Checks if the given value is valid as phone number
 * @param {Number|String} number
 * @return {Boolean}
 */
function isAValidPhoneNumber(number) {
  return /^[\d\+\-\(\) ]+$/.test(number);
}

