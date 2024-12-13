const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendMessage } = require('./message');
const config = require('../configure.json');

const commands = new Map();
const userStates = new Map(); // Suivi des états des utilisateurs
const userConversations = new Map(); // Historique des conversations des utilisateurs

// Chargement des commandes
const commandFiles = fs.readdirSync(path.join(__dirname, '../cmds')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`../cmds/${file}`);
    commands.set(command.name.toLowerCase(), command);
    console.log(`Loaded command: ${command.name}`);
}

// Fonction principale pour gérer les messages entrants
async function handleMessage(event, pageAccessToken) {
    if (!event?.sender?.id) {
        console.error('Invalid event object: Missing sender ID.');
        return;
    }

    const senderId = event.sender.id;

    // Ajouter le message reçu à l'historique de l'utilisateur
    if (!userConversations.has(senderId)) {
        userConversations.set(senderId, []);
    }
    userConversations.get(senderId).push({ type: 'user', text: event.message.text || 'Image' });

    if (event.message?.attachments?.[0]?.type === 'image') {
        const imageUrl = event.message.attachments[0].payload.url;
        await askForImagePrompt(senderId, imageUrl, pageAccessToken);
    } else if (event.message?.text) {
        const messageText = event.message.text.trim();
        console.log(`Received message: ${messageText}`);

        // Commande "stop" pour quitter le mode actuel
        if (messageText.toLowerCase() === 'stop') {
            userStates.delete(senderId);
            await sendMessage(senderId, { text: "🔓 Vous avez quitté le mode actuel. Tapez 'menu' pour continuer ✔." }, pageAccessToken);
            return;
        }

        // Si l'utilisateur attend une analyse d'image
        if (userStates.has(senderId) && userStates.get(senderId).awaitingImagePrompt) {
            const { imageUrl } = userStates.get(senderId);
            await analyzeImageWithPrompt(senderId, imageUrl, messageText, pageAccessToken);
            return;
        }

        // Gestion des commandes
        const args = messageText.split(' ');
        const commandName = args.shift().toLowerCase();

        if (commands.has(commandName)) {
            const command = commands.get(commandName);

            if (command.role === 0 && !config.adminId.includes(senderId)) {
                await sendMessage(senderId, { text: '❌ Vous n\'êtes pas autorisé à utiliser cette commande.' }, pageAccessToken);
                return;
            }

            try {
                userStates.set(senderId, { lockedCommand: commandName });
                await command.execute(senderId, args, pageAccessToken, event);
            } catch (error) {
                console.error(`Erreur lors de l'exécution de la commande "${commandName}" :`, error);
                sendMessage(senderId, { text: '⚠️ Une erreur est survenue lors de l\'exécution de cette commande.' }, pageAccessToken);
            }
        } else {
            const defaultCommand = commands.get('ai');
            if (defaultCommand) {
                try {
                    await defaultCommand.execute(senderId, [messageText], pageAccessToken, event);
                } catch (error) {
                    console.error('Erreur lors de l\'exécution de la commande par défaut "ai" :', error);
                    sendMessage(senderId, { text: '⚠️ Une erreur est survenue lors du traitement de votre demande.' }, pageAccessToken);
                }
            } else {
                sendMessage(senderId, { text: "❓ Désolé, je n'ai pas compris. Essayez une commande valide." }, pageAccessToken);
            }
        }
    }
}

// Demander le prompt de l'utilisateur pour analyser l'image
async function askForImagePrompt(senderId, imageUrl, pageAccessToken) {
    userStates.set(senderId, { awaitingImagePrompt: true, imageUrl: imageUrl });
    await sendMessage(senderId, { text: "📷 Image reçue. Que voulez-vous que je fasse avec cette image ? Posez toutes vos questions ! 📸😊." }, pageAccessToken);
}

// Fonction pour analyser l'image avec le prompt fourni par l'utilisateur
async function analyzeImageWithPrompt(senderId, imageUrl, prompt, pageAccessToken) {
    try {
        await sendMessage(senderId, { text: "🔍 Analyse de l'image en cours... ⏳" }, pageAccessToken);

        const analysisResult = await analyzeImageWithGemini(imageUrl, prompt);
        if (analysisResult) {
            await sendMessage(senderId, { text: `📄 Résultat de l'analyse :\n${analysisResult}` }, pageAccessToken);
        } else {
            await sendMessage(senderId, { text: "❌ Aucune information utile trouvée pour cette image." }, pageAccessToken);
        }
    } catch (error) {
        console.error("Erreur lors de l'analyse de l'image :", error);
        await sendMessage(senderId, { text: "⚠️ Une erreur est survenue lors de l'analyse de l'image." }, pageAccessToken);
    }
}

// Fonction pour appeler l'API Gemini pour analyser une image avec un prompt
async function analyzeImageWithGemini(imageUrl, prompt) {
    const geminiApiEndpoint = 'https://sandipbaruwal.onrender.com/gemini2';

    try {
        const response = await axios.get(`${geminiApiEndpoint}?url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`);
        return response.data?.answer || '';
    } catch (error) {
        console.error("Erreur avec l'API Gemini :", error);
        throw new Error("Erreur lors de l'analyse avec Gemini.");
    }
}

async function getAttachments(mid, pageAccessToken) {
    if (!mid) throw new Error("No message ID provided.");

    try {
        const { data } = await axios.get(`https://graph.facebook.com/v21.0/${mid}/attachments`, {
            params: { access_token: pageAccessToken }
        });

        if (data?.data?.length > 0 && data.data[0].image_data) {
            return data.data[0].image_data.url;
        } else {
            throw new Error("No image found in the replied message.");
        }
    } catch (error) {
        console.error("Erreur lors de la récupération des pièces jointes :", error);
        throw new Error("Échec de la récupération des pièces jointes.");
    }
}

module.exports = { handleMessage };
