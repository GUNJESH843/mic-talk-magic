import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, MicOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AudioProcessor } from "@/utils/AudioProcessor";

const VoiceAgent = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioProcessorRef.current) {
        audioProcessorRef.current.stopRecording();
      }
    };
  }, []);

  const startConversation = async () => {
    try {
      // Get Supabase project URL from environment
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      const wsUrl = projectUrl.replace("https://", "wss://") + "/functions/v1/voice-relay";

      console.log("Connecting to WebSocket:", wsUrl);

      // Create WebSocket connection to our Edge Function relay
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        setIsListening(true);

        // Initialize audio processor
        audioProcessorRef.current = new AudioProcessor((audioData) => {
          // Send audio data to WebSocket (full duplex - continuous sending)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(audioData);
          }
        });

        // Start recording
        audioProcessorRef.current.startRecording();

        toast({
          title: "Connected",
          description: "You can now speak with your farming expert",
        });
      };

      ws.onmessage = async (event) => {
        console.log("Received message from agent");
        
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "session-info") {
            console.log("Session info:", data.data);
            return;
          }

          // Handle audio data from agent (full duplex - continuous receiving)
          if (data.type === "audio") {
            setIsSpeaking(true);
            
            // Convert base64 audio to ArrayBuffer
            const audioData = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
            
            // Play audio
            if (audioProcessorRef.current) {
              await audioProcessorRef.current.playAudio(audioData.buffer);
            }
            
            setTimeout(() => setIsSpeaking(false), 100);
          }
        } catch (error) {
          console.error("Error processing message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        toast({
          title: "Connection Error",
          description: "Failed to maintain connection with farming expert",
          variant: "destructive",
        });
      };

      ws.onclose = () => {
        console.log("WebSocket closed");
        setIsConnected(false);
        setIsListening(false);
        setIsSpeaking(false);
        
        if (audioProcessorRef.current) {
          audioProcessorRef.current.stopRecording();
        }
      };
    } catch (error) {
      console.error("Error starting conversation:", error);
      toast({
        title: "Connection Failed",
        description: "Could not connect to the farming expert",
        variant: "destructive",
      });
    }
  };

  const endConversation = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (audioProcessorRef.current) {
      audioProcessorRef.current.stopRecording();
      audioProcessorRef.current = null;
    }

    setIsConnected(false);
    setIsListening(false);
    setIsSpeaking(false);

    toast({
      title: "Conversation Ended",
      description: "Thank you for using Farm Vaidya",
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background farming image */}
      <div className="absolute inset-0 opacity-20">
        <img
          src="https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=1200&h=800&fit=crop"
          alt="Farm background"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">
            farm <span className="text-accent">vaidya</span>
          </h1>
          <p className="text-sm text-muted-foreground">sustainability with voice agent</p>
        </div>

        {/* Main card */}
        <Card className="p-8 shadow-2xl backdrop-blur-sm bg-card/95">
          <div className="text-center space-y-6">
            <h2 className="text-xl font-semibold text-foreground">
              Your AI-powered farming expert
            </h2>

            {/* Microphone button */}
            <div className="flex justify-center">
              <button
                onClick={isConnected ? undefined : startConversation}
                disabled={isConnected}
                className={`
                  relative w-32 h-32 rounded-full bg-accent text-accent-foreground
                  flex items-center justify-center transition-all duration-300
                  ${isConnected && isSpeaking ? "pulse-animation" : ""}
                  ${!isConnected ? "hover:scale-110 cursor-pointer shadow-xl" : "cursor-not-allowed"}
                  disabled:opacity-90
                `}
              >
                {isConnected ? (
                  <Mic className="w-12 h-12" />
                ) : (
                  <MicOff className="w-12 h-12" />
                )}
              </button>
            </div>

            {/* Status text */}
            <p className="text-primary font-medium">
              {isSpeaking 
                ? "Agent is speaking..." 
                : isListening 
                ? "Listening to you..." 
                : "Tap to start"}
            </p>

            {/* End conversation button */}
            {isConnected && (
              <Button
                onClick={endConversation}
                variant="destructive"
                className="w-full rounded-full h-12 text-lg font-semibold"
              >
                End Conversation
              </Button>
            )}

            {/* Connection status */}
            <div className="flex items-center justify-center gap-2 text-sm">
              <div
                className={`w-3 h-3 rounded-full ${
                  isConnected ? "bg-success" : "bg-muted-foreground"
                }`}
              />
              <span className={isConnected ? "text-success" : "text-muted-foreground"}>
                {isConnected ? "Connected & Ready" : "Not Connected"}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default VoiceAgent;
