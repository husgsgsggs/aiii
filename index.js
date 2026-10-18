require('dotenv').config();
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    Browsers 
} = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/generative-ai');
const pino = require('pino');
const readline = require('readline');

// FIXED: Initializing with the correct class parameter format
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false
    });

    if (!sock.authState.creds.registered) {
        console.log("\n==================================================");
        console.log("🪐 HAKARI WHATSAPP BOT - PAIRING INITIALIZATION 🪐");
        console.log("==================================================\n");
        const phoneNumber = await question('Enter your WhatsApp number with Country Code (e.g. 923001234567): ');
        
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(`\n🔥 Your Pairing Code is: \x1b[32m${code}\x1b[0m`);
                console.log("Go to WhatsApp -> Linked Devices -> Link with Phone Number and enter it.\n");
            } catch (err) {
                console.error("Failed to generate a pairing code: ", err);
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('\n==================================================');
            console.log('🚀 HAKARI BOT CONNECTED SUCCESSFULLY & LIVE 24/7!');
            console.log('==================================================\n');
        }
    });

    sock.ev.on('messages.upsert', async (msgChat) => {
        try {
            const m = msgChat.messages;
            if (!m.message || m.key.fromMe) return;

            const remoteJid = m.key.remoteJid;
            let body = m.message.conversation || 
                       m.message.extendedTextMessage?.text || 
                       m.message.imageMessage?.caption || "";

            const trimmedBody = body.trim();

            if (trimmedBody.toLowerCase() === '.alive') {
                const stylishAlive = 
                    "╭═══〔 🪐 *⚡️ HAKARI USER BOT ⚡️* 〕═══╮\n" +
                    "┃\n" +
                    "┃ 🟢 *STATUS:* RUNNING 24/7\n" +
                    "┃ 👑 *AUTHORITY:* HAKARI\n" +
                    "┃ ✨ *🧬 I AM ALIVE HAKARI MY OWNER*\n" +
                    "┃\n" +
                    "╰══════════════════════════╯";
                
                await sock.sendMessage(remoteJid, { text: stylishAlive }, { quoted: m });
            }

            if (trimmedBody.toLowerCase().startsWith('.ai ')) {
                const prompt = trimmedBody.slice(4).trim();
                if (!prompt) return;

                await sock.sendMessage(remoteJid, { text: "⏳ *Hakari AI is processing your request...*" }, { quoted: m });

                try {
                    // FIXED: Calling the content generation method signature smoothly
                    const response = await ai.models.generateContent({
                        model: 'gemini-1.5-flash',
                        contents: prompt,
                    });
                    
                    const responseText = response.text;
                    await sock.sendMessage(remoteJid, { text: `🔮 *Hakari Gemini AI:* \n\n${responseText}` }, { quoted: m });

                } catch (aiErr) {
                    console.error("Gemini API Error details:", aiErr);
                    await sock.sendMessage(remoteJid, { text: "⚠️ *Error:* Could not fetch response from Gemini." }, { quoted: m });
                }
            }
        } catch (error) {
            console.error("Error reading inbound message context:", error);
        }
    });
}

process.on('unhandledRejection', (reason, p) => { console.error('Caught unhandled rejection:', p, 'reason:', reason); });
process.on('uncaughtException', (err) => { console.error('Intercepted critical uncaught exception:', err); });

startBot();
