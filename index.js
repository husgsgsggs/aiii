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

// Initialize Gemini API correctly using the official SDK
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startBot() {
    // 24/7 Session tracking: Saves credentials dynamically inside the "./session" folder
    const { state, saveCreds } = await useMultiFileAuthState('./session');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // Turned off since we are using a pairing code
        auth: state,
        browser: Browsers.macOS('Desktop'), // Necessary browser configuration to avoid pairing drops
        syncFullHistory: false
    });

    // Code logic to prompt your number only if no active session folder exists
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

    // Save auth parameters automatically when updated
    sock.ev.on('creds.update', saveCreds);

    // Auto-reconnect & Lifecycle Handling
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                startBot(); // Re-trigger connection loop instantly to maintain 24/7 status
            }
        } else if (connection === 'open') {
            console.log('\n==================================================');
            console.log('🚀 HAKARI BOT CONNECTED SUCCESSFULLY & LIVE 24/7!');
            console.log('==================================================\n');
        }
    });

    // Message processing handler
    sock.ev.on('messages.upsert', async (msgChat) => {
        try {
            const m = msgChat.messages[0];
            if (!m.message || m.key.fromMe) return; // Prevent bot from triggering itself

            const remoteJid = m.key.remoteJid;
            
            // Extract textual elements from different payload structures
            let body = m.message.conversation || 
                       m.message.extendedTextMessage?.text || 
                       m.message.imageMessage?.caption || "";

            const trimmedBody = body.trim();

            // Command 1: .alive
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

            // Command 2: .ai [anything]
            if (trimmedBody.toLowerCase().startsWith('.ai ')) {
                const prompt = trimmedBody.slice(4).trim();
                if (!prompt) return;

                // Send a typing / loading visual acknowledgement indicator
                await sock.sendMessage(remoteJid, { text: "⏳ *Hakari AI is processing your request...*" }, { quoted: m });

                try {
                    // Call the models engine
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

// Global process exception catchers to enforce strict anti-crash behavior
process.on('unhandledRejection', (reason, p) => { console.error('Caught unhandled rejection to stop server crash:', p, 'reason:', reason); });
process.on('uncaughtException', (err) => { console.error('Intercepted critical uncaught exception to maintain 24/7 uptime:', err); });

startBot();
