import { Server } from "socket.io";

export default function handler(req, res) {
  if (!res.socket.server.io) {
    console.log("🔥 Initializing Socket.io...");

    const io = new Server(res.socket.server, {
      path: "/api/socket",
      cors: {
        origin: "*",
      },
    });

    io.on("connection", (socket) => {
      console.log("Socket connected:", socket.id);

      socket.on("register_streamer", (sessionId) => {
        socket.join(sessionId);
        socket.to(sessionId).emit("streamer_ready", socket.id);
      });

      socket.on("join_viewer", (sessionId) => {
        socket.join(sessionId);
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
    });

    res.socket.server.io = io;
  }

  res.end();
}