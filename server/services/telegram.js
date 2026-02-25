const TelegramBot = require('node-telegram-bot-api');
const Community = require('../models/Community');
const User = require('../models/User');

const communityBots = new Map();

function startBot(communityName, token) {
    if (!token || communityBots.has(communityName)) return;
    const bot = new TelegramBot(token, { polling: true });
    communityBots.set(communityName, bot);
    console.log(`🤖 Bot Service: Started for ${communityName}`);

    bot.onText(/\/start (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = match[1];
        try {
            const user = await User.findOne({ id: userId, communityName });
            if (user) {
                user.telegramChatId = chatId;
                await user.save();
                bot.sendMessage(chatId, `✅ Comunidad ${communityName} vinculada.`);
            }
        } catch (e) { }
    });
}

async function sendAlert(communityName, message) {
    const bot = communityBots.get(communityName);
    if (!bot) return;
    try {
        const users = await User.find({ communityName, telegramChatId: { $exists: true, $ne: null } });
        for (const user of users) {
            try { await bot.sendMessage(user.telegramChatId, message, { parse_mode: 'Markdown' }); } catch (e) { }
        }
    } catch (e) { console.error('Telegram Alert Error:', e); }
}

async function initAllLocal() {
    const communities = await Community.find({ telegramBotToken: { $exists: true, $ne: null } });
    communities.forEach(c => startBot(c.name, c.telegramBotToken));
}

module.exports = { startBot, sendAlert, initAllLocal };
