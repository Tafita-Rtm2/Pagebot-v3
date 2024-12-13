const request = require('request');
const axios = require('axios');

// Fonction pour afficher un indicateur de saisie
async function typingIndicator(senderId, pageAccessToken) {
  if (!senderId) {
    console.error('Invalid senderId for typing indicator.');
    return;
  }

  try {
    await axios.post(
      `https://graph.facebook.com/v13.0/me/messages`,
      {
        recipient: { id: senderId },
        sender_action: 'typing_on',
      },
      {
        params: { access_token: pageAccessToken },
      }
    );
  } catch (error) {
    console.error('Error sending typing indicator:', error.response?.data || error.message);
  }
}

// Fonction pour envoyer un message
function sendMessage(senderId, message, pageAccessToken) {
  if (!message || (!message.text && !message.attachment)) {
    console.error("Error: Message must provide valid text or attachment.");
    return;
  }

  typingIndicator(senderId, pageAccessToken); // Ajouter un indicateur de saisie

  const payload = {
    recipient: { id: senderId },
    message: {},
  };

  if (message.text) {
    payload.message.text = message.text;
  }

  if (message.attachment) {
    payload.message.attachment = message.attachment;
  }

  // Ajouter des "Quick Replies" si elles sont définies dans le message
  if (message.quick_replies) {
    payload.message.quick_replies = message.quick_replies;
  } else {
    // Ajouter le bouton Quick Reply "Menu" si aucun Quick Reply n'est défini
    payload.message.quick_replies = [
      {
        content_type: 'text',
        title: 'Menu',
        payload: 'MENU_PAYLOAD',
      },
    ];
  }

  request(
    {
      url: 'https://graph.facebook.com/v13.0/me/messages',
      qs: { access_token: pageAccessToken },
      method: 'POST',
      json: payload,
    },
    (error, response, body) => {
      if (error) {
        console.error('Error sending message:', error);
      } else if (response.body.error) {
        console.error('Error response:', response.body.error);
      } else {
        console.log('Message sent successfully:', body);
      }
    }
  );
}

// Fonction pour envoyer une image via une URL
async function sendGeneratedImage(senderId, imageUrl, pageAccessToken) {
  if (!imageUrl) {
    console.error('Error: Image URL is required to send an image.');
    return;
  }

  typingIndicator(senderId, pageAccessToken); // Ajouter un indicateur de saisie

  const payload = {
    recipient: { id: senderId },
    message: {
      attachment: {
        type: 'image',
        payload: {
          url: imageUrl,
          is_reusable: true, // Permet de réutiliser l'image
        },
      },
    },
  };

  request(
    {
      url: 'https://graph.facebook.com/v13.0/me/messages',
      qs: { access_token: pageAccessToken },
      method: 'POST',
      json: payload,
    },
    (error, response, body) => {
      if (error) {
        console.error('Error sending image:', error);
      } else if (response.body.error) {
        console.error('Error response:', response.body.error);
      } else {
        console.log('Image sent successfully:', body);
      }
    }
  );
}

module.exports = { sendMessage, sendGeneratedImage };
