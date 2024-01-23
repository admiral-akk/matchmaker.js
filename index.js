import express from "express.js";
import { createServer } from "node:http.js";
import { fileURLToPath } from "node:url.js";
import { dirname, join } from "node:path.js";
import { Server } from "socket.io.js";
import { v4 as uuidv4 } from "uuid.js";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
});

const __dirname = dirname(fileURLToPath(import.meta.url));

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

class Player {
  constructor(socket, candidates, offer) {
    this.socket = socket;
    this.candidates = candidates;
    this.offer = offer;
  }
}

class Session {
  constructor(host) {
    this.state = "Waiting";
    this.id = uuidv4();
    this.host = host;
    this.player = null;
    host.socket.emit("lobby", { hostId: this.id });
  }

  containsSocket(socket) {
    return (
      this.host.socket === socket ||
      (this.player && this.player.socket === socket)
    );
  }

  removeSocket(socket) {
    if (this.host.socket === socket) {
      this.host = null;
    }
    if (this.player && this.player.socket === socket) {
      this.player = null;
    }
  }

  makeOffer(player) {
    this.state = "Signaling";
    this.player = player;
    player.socket.emit("offer", {
      candidates: this.host.candidates,
      offer: this.host.offer,
    });
  }

  handleAnswer(answer) {
    this.state = "Connected";
    this.player.candidates = answer.candidates;
    this.player.offer = answer.offer;
    this.host.socket.emit("answer", {
      candidates: this.player.candidates,
      offer: this.player.offer,
    });
  }

  removePlayer() {
    this.state = "Waiting";
    this.player = null;
  }

  promotePlayer() {
    if (!this.host && this.player) {
      this.host = this.player;
      this.removePlayer();
    }
  }
}

Array.prototype.removeIf = function (callback) {
  var i = this.length;
  while (i--) {
    if (callback(this[i], i)) {
      this.splice(i, 1);
    }
  }
};

const sessions = [];

const findSession = (hostId) => sessions.find((s) => s.id === hostId);

const createSession = (player) => {
  const session = new Session(player);
  sessions.push(session);
};

io.on("connection", (socket) => {
  console.log("a user connected");

  socket.on("disconnect", () => {
    console.log("disconnect - sessions", sessions);
    // remove player from all sessions
    sessions.forEach((s) => {
      s.removeSocket(socket);
      s.promotePlayer();
    });

    // remove sessions where the session has no players
    sessions.removeIf((s) => !s.host && !s.player);
    console.log("user disconnected");
  });

  socket.on("joinLobby", (msg) => {
    console.log("joinLobby", msg);
    const player = new Player(socket, msg.candidates, msg.offer);
    const session = findSession(msg.hostId);
    console.log("joinLobby - session", session);
    if (session && session.state === "Waiting") {
      session.makeOffer(player);
    } else {
      createSession(player);
    }
    console.log("joinLobby - sessions", sessions);
  });

  socket.on("answer", (msg) => {
    console.log("answer", msg);
    const session = findSession(msg.hostId);
    if (session && session.state === "Signaling") {
      session.handleAnswer(msg);
    } else {
      socket.emit("requestLobby", {});
    }
  });
});

server.listen(3000, () => {
  console.log("server running at http://localhost:3000");
});
