const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.text({ limit: "1mb" }));

const DISCORD_CLIENT_ID = "1570447835223162940";
const DISCORD_CLIENT_SECRET = "6ba0r3NMlwsCCX3h03_yEb7uH8x9sW6C";
const DISCORD_REDIRECT_URI = "https://finder-slots.onrender.com/auth/discord/callback";

let slotsDatabase = {};
let activeWebSocketClients = {};

app.get("/auth/discord", (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(url);
});

app.get("/auth/discord/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send("Erro no login.");
    try {
        const tokenResponse = await axios.post("https://discord.com/api/oauth2/token", new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: DISCORD_REDIRECT_URI
        }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });

        const accessToken = tokenResponse.data.access_token;
        const userResponse = await axios.get("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${accessToken}` } });
        const user = userResponse.data;
        
        res.json({
            status: "success",
            user: { id: user.id, username: user.username, avatar: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` }
        });
    } catch (error) {
        console.log("ERRO DISCORD:", error.response?.data || error.message);
        res.status(500).send("Erro ao autenticar com Discord.");
    }
});

app.post("/slots/buy", (req, res) => {
    const { discordId, discordName } = req.body;
    const newKey = "BR-" + uuidv4().substring(0, 4).toUpperCase() + "-" + uuidv4().substring(0, 4).toUpperCase();
    
    slotsDatabase[newKey] = {
        ownerId: discordId,
        ownerName: discordName,
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
    };
    res.json({ status: "success", key: newKey });
});

app.get("/slots/info/:key", (req, res) => {
    const slot = slotsDatabase[req.params.key];
    if (!slot) return res.status(404).json({ error: "Slot não encontrado" });
    res.json(slot);
});

app.post("/logs", (req, res) => {
    const body = (req.body || "").toString().trim();
    if (body) {
        const parts = body.split("|");
        const key = parts[0];

        if (!slotsDatabase[key]) return res.status(401).send("Key invalida");

        const logData = {
            name: parts[1] || "Unknown",
            money: parts[2] || "0",
            mutation: parts[3] || "None",
            jobId: parts[4] || ""
        };

        if (activeWebSocketClients[key]) {
            activeWebSocketClients[key].forEach(client => {
                if (client.readyState === 1) client.send(JSON.stringify(logData));
            });
        }
    }
    res.send("ok");
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
    const urlParams = new URLSearchParams(req.url.split("?")[1]);
    const key = urlParams.get("key");
    
    if (!key || !slotsDatabase[key]) { ws.close(); return; }

    if (!activeWebSocketClients[key]) activeWebSocketClients[key] = [];
    activeWebSocketClients[key].push(ws);

    ws.on("close", () => {
        activeWebSocketClients[key] = activeWebSocketClients[key].filter(c => c !== ws);
    });
});

server.listen(process.env.PORT || 3000, () => {
    console.log("API rodando na porta", process.env.PORT || 3000);
});
