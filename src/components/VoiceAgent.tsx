import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, MicOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DailyIframe from "@daily-co/daily-js";

const VoiceAgent = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [callFrame, setCallFrame] = useState<any>(null);
  const { toast } = useToast();
  const connectLockRef = useRef(false);

  const startConversation = async () => {
    if (connectLockRef.current || isConnecting || isConnected) return; // Prevent multiple calls
    setIsConnecting(true);
    connectLockRef.current = true;
    try {
      // Call Pipecat API to create session
      const response = await fetch("https://api.pipecat.daily.co/v1/public/v3/start", {
        method: "POST",
        headers: {
          "Authorization": "Bearer pk_aff3af37-4821-4efc-9776-1f2d300a52d0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          createDailyRoom: true,
          warm: true,
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
      });

      const data = await response.json();
      console.log("Session created:", data);

      // Preflight: ensure no existing Daily call instance remains (prevents duplicate instance errors)
      try {
        if (callFrame) {
          try { await callFrame.leave(); } catch {}
          try { await callFrame.destroy(); } catch {}
          setCallFrame(null);
        }
        const existing = (DailyIframe as any).getCallInstance?.();
        if (existing) {
          try { await existing.leave(); } catch {}
          try { await existing.destroy(); } catch {}
        }
      } catch (e) {
        console.warn("Daily preflight cleanup failed", e);
      }

      // Create Daily call frame
      const frame = DailyIframe.createFrame({
        showLeaveButton: false,
        showFullscreenButton: false,
        iframeStyle: {
          position: "fixed",
          width: "1px",
          height: "1px",
          opacity: "0",
          pointerEvents: "none",
        },
      });

      // Join the room
      await frame.join({
        url: data.dailyRoom,
        token: data.dailyToken,
      });

      setCallFrame(frame);
      setIsConnected(true);
      
      toast({
        title: "Connected",
        description: "You can now speak with your farming expert",
      });

      // Handle meeting lifecycle
      frame.on("joined-meeting", () => {
        console.log("Joined meeting");
        setIsConnected(true);
        toast({
          title: "Connected",
          description: "You can now speak with your farming expert",
        });
      });

      frame.on("left-meeting", () => {
        console.log("Left meeting");
        setIsConnected(false);
        setIsSpeaking(false);
      });

      frame.on("error", (e: any) => {
        console.error("Daily error:", e);
        setIsSpeaking(false);
        setIsConnected(false);
        toast({
          title: "Connection error",
          description: "Could not connect to the farming expert",
          variant: "destructive",
        });
      });

      // Listen for participant events
      frame.on("participant-joined", (event: any) => {
        console.log("Participant joined:", event);
      });

      frame.on("participant-left", () => {
        console.log("Participant left");
        setIsSpeaking(false);
      });

      // Track when user is speaking using audio level
      frame.on("active-speaker-change", (event: any) => {
        console.log("Active speaker:", event);
        const localParticipant = frame.participants().local;
        if (event.activeSpeaker?.peerId === localParticipant?.user_id) {
          setIsSpeaking(true);
        } else {
          setIsSpeaking(false);
        }
      });

      // Also track participant updates for more granular control
      frame.on("participant-updated", (event: any) => {
        const localParticipant = frame.participants().local;
        if (event.participant?.user_id === localParticipant?.user_id) {
          // User's audio state changed
          if (event.participant?.tracks?.audio?.state === "playable") {
            // User's mic is active but not necessarily speaking
          }
        }
      });

    } catch (error) {
      console.error("Error starting conversation:", error);
      toast({
        title: "Connection Failed",
        description: "Could not connect to the farming expert",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
      connectLockRef.current = false;
    }
  };

  const endConversation = async () => {
    if (callFrame) {
      await callFrame.leave();
      await callFrame.destroy();
      setCallFrame(null);
      setIsConnected(false);
      setIsSpeaking(false);
      connectLockRef.current = false;

      toast({
        title: "Conversation Ended",
        description: "Thank you for using Farm Vaidya",
      });
    }
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
                onClick={startConversation}
                disabled={isConnected || isConnecting}
                className={`
                  relative w-32 h-32 rounded-full bg-accent text-accent-foreground
                  flex items-center justify-center transition-all duration-300
                  ${isConnected && isSpeaking ? "pulse-animation" : ""}
                  ${!isConnected && !isConnecting ? "hover:scale-110 cursor-pointer shadow-xl" : "cursor-not-allowed"}
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
              {isConnecting ? "Connecting..." : isSpeaking ? "You are speaking..." : isConnected ? "Listening..." : "Tap to start"}
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
