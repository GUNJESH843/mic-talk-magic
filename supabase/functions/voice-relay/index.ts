import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  try {
    // Create Pipecat session
    const pipecatResponse = await fetch(
      "https://api.pipecat.daily.co/v1/public/test/start",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer pk_aff3af37-4821-4efc-9776-1f2d300a52d0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          createDailyRoom: true,
          dailyRoomProperties: {
            enable_recording: "cloud",
            privacy: "public",
          },
          dailyMeetingTokenProperties: {
            is_owner: true,
          },
          body: {
            foo: "bar",
          },
        }),
      }
    );

    const pipecatData = await pipecatResponse.json();
    console.log("Pipecat session created:", pipecatData);

    // Upgrade to WebSocket
    const { socket, response } = Deno.upgradeWebSocket(req);

    // Connect to Daily.co WebSocket for the agent
    const dailyWsUrl = pipecatData.dailyRoom.replace("https://", "wss://");
    const dailySocket = new WebSocket(
      `${dailyWsUrl}?token=${pipecatData.dailyToken}`
    );

    // Handle client -> Daily connection
    socket.onopen = () => {
      console.log("Client WebSocket opened");
      socket.send(
        JSON.stringify({
          type: "session-info",
          data: pipecatData,
        })
      );
    };

    socket.onmessage = (event) => {
      console.log("Received from client:", event.data);
      // Forward client audio to Daily
      if (dailySocket.readyState === WebSocket.OPEN) {
        dailySocket.send(event.data);
      }
    };

    socket.onerror = (error) => {
      console.error("Client WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("Client WebSocket closed");
      if (dailySocket.readyState === WebSocket.OPEN) {
        dailySocket.close();
      }
    };

    // Handle Daily -> client connection
    dailySocket.onopen = () => {
      console.log("Daily WebSocket opened");
    };

    dailySocket.onmessage = (event) => {
      console.log("Received from Daily:", event.data);
      // Forward agent audio to client
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(event.data);
      }
    };

    dailySocket.onerror = (error) => {
      console.error("Daily WebSocket error:", error);
    };

    dailySocket.onclose = () => {
      console.log("Daily WebSocket closed");
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };

    return response;
  } catch (error) {
    console.error("Error setting up WebSocket relay:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
