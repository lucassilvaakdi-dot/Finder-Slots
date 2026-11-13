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

// Página do site: coloque o index.html dentro de uma pasta chamada "public"

const DISCORD_CLIENT_ID = "1570447835223162940";
const DISCORD_CLIENT_SECRET = "FlTmtJs0xNLEJhSJ7jjK1xMEppXo7JGB";
const DISCORD_REDIRECT_URI = "https://finder-slots.onrender.com/auth/discord/callback";

let slotsDatabase = {};
let activeWebSocketClients = {};
let sessions = {};

app.get("/auth/discord", (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(url);
});

app.get("/auth/discord/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) return res.redirect("/?error=auth");

    try {
        const tokenResponse = await axios.post("https://discord.com/api/oauth2/token", new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: DISCORD_REDIRECT_URI
        }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });

        const accessToken = tokenResponse.data.access_token;
        const userResponse = await axios.get("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const user = userResponse.data;

        const avatar = user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
            : "";

        const sessionToken = uuidv4();
        sessions[sessionToken] = { id: user.id, name: user.username, avatar };

        const params = new URLSearchParams({
            token: sessionToken,
            name: user.username,
            avatar: avatar
        });
        res.redirect(`/?${params.toString()}`);
    } catch (error) {
        console.log("ERRO DISCORD:", error.response?.data || error.message);
        res.redirect("/?error=auth");
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
