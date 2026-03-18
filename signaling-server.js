const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();

// Get allowed origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : "*";

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("register_streamer", (sessionId) => {
    socket.join(sessionId);
    console.log(`Streamer registered for session ${sessionId}`);
    socket.to(sessionId).emit("streamer_ready", socket.id);
  });

  socket.on("join_viewer", (sessionId) => {
    socket.join(sessionId);
    console.log(`Viewer joined session ${sessionId}`);
    socket.to(sessionId).emit("viewer_joined", socket.id);
  });

  socket.on("offer", ({ target, sdp }) => {
    io.to(target).emit("offer", { sdp, caller: socket.id });
  });

  socket.on("answer", ({ target, sdp }) => {
    io.to(target).emit("answer", { sdp, caller: socket.id });
  });

  socket.on("candidate", ({ target, candidate }) => {
    io.to(target).emit("candidate", { candidate, caller: socket.id });
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

const PORT = process.env.SIGNALING_PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`> Signaling server ready on http://0.0.0.0:${PORT}`);
});
