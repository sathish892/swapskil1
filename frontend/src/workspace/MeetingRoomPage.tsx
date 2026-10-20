import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { PublicUser } from "../auth/types";
import { WorkspaceShell } from "./WorkspaceShell";
import { readApi } from "./types";

type Participant = { id: string; fullName: string; role: string };
type LearningSession = { id: string; title: string; skill?: string; skillName?: string; description: string; scheduledAt: string | null; durationMinutes: number; meetingStatus: string; status?: string; cancelledAt: string | null; createdBy: string | null; participants: Participant[] };
type EndReview = { sessionId?: string; roomId?: string; skillName: string; ratingType: "teacher" | "learner"; recipient: { id: string; fullName: string } };
type ChatMessage = { id: string; senderId: string; senderName: string; body: string; createdAt: string };
type Signal = { type: string; from?: string; fromName?: string; participant?: { id: string; fullName: string }; participants?: { id: string; fullName: string }[]; participantId?: string; message?: string; chatMessage?: ChatMessage; payload?: RTCSessionDescriptionInit | RTCIceCandidateInit };
type RemoteStream = { id: string; name: string; stream: MediaStream };

function formatTime(date: Date) { return date.toLocaleString([], { dateStyle: "full", timeStyle: "short" }); }

function RemoteVideo({ participant, connected }: { participant: RemoteStream; connected: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (video.current) video.current.srcObject = participant.stream; }, [participant.stream]);
  const hasVideo = participant.stream.getVideoTracks().some((track) => track.readyState === "live" && track.enabled);
  return <div className="relative aspect-video overflow-hidden rounded-3xl bg-[#172b27] text-white">
    <video ref={video} autoPlay playsInline className="size-full object-cover" />
    {!hasVideo && <div className="absolute inset-0 grid place-items-center text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-full bg-white/10 text-xl font-bold">{participant.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span><p className="mt-3 text-sm">{participant.name} has their camera off.</p></div></div>}
    <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1.5 text-xs">{participant.name} · {connected ? "connected" : "connecting"}</span>
  </div>;
}

export function MeetingRoomPage({ sessionId, openRoom = false, user, onLogout, loggingOut, logoutError }: { sessionId: string; openRoom?: boolean; user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string }) {
  const [session, setSession] = useState<LearningSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [mediaNotice, setMediaNotice] = useState("");
  const [remoteStreams, setRemoteStreams] = useState<Record<string, RemoteStream>>({});
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [connection, setConnection] = useState("Not in the meeting");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState("");
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [collaborationTab, setCollaborationTab] = useState<"chat" | "notes">("chat");
  const [pendingEndReviews, setPendingEndReviews] = useState<EndReview[]>([]);
  const [endReviewStars, setEndReviewStars] = useState<Record<string, number>>({});
  const [endReviewTexts, setEndReviewTexts] = useState<Record<string, string>>({});
  const [reviewSubmitting, setReviewSubmitting] = useState("");
  const [endMessage, setEndMessage] = useState("");
  const [endError, setEndError] = useState("");
  const endRequestedRef = useRef(false);
  const sessionLoadInFlightRef = useRef(false);
  const [clock, setClock] = useState(Date.now());
  const localVideo = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const joinedOpenRoomRef = useRef(false);
  const shouldLeaveRef = useRef(false);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const openRoomId = openRoom ? sessionId.slice("open-".length) : sessionId;
  const sessionUrl = (openRoom ? "/api/open-learning-rooms/" + encodeURIComponent(openRoomId) : "/api/learning-sessions/" + encodeURIComponent(sessionId));
  const collaborationUrl = "/api/meetings/" + (openRoom ? "open-room" : "session") + "/" + encodeURIComponent(openRoomId);

  const loadChatHistory = useCallback(async () => {
    const response = await fetch(collaborationUrl + "/chat", { credentials: "include" });
    const payload = await readApi<{ messages?: ChatMessage[]; error?: string }>(response);
    if (!response.ok) throw new Error(payload.error || "Couldn’t load meeting messages.");
    setChatMessages(payload.messages || []);
  }, [collaborationUrl]);

  const loadNotes = useCallback(async () => {
    const response = await fetch(collaborationUrl + "/notes", { credentials: "include" });
    const payload = await readApi<{ notes?: string; error?: string }>(response);
    if (!response.ok) throw new Error(payload.error || "Couldn’t load your notes.");
    setNotes(payload.notes || "");
  }, [collaborationUrl]);

  useEffect(() => {
    if (openRoom) return;
    void Promise.all([
      loadChatHistory().catch((cause: unknown) => setChatError(cause instanceof Error ? cause.message : "Couldn’t load meeting messages.")),
      loadNotes().catch((cause: unknown) => setNotesError(cause instanceof Error ? cause.message : "Couldn’t load your private notes.")),
    ]);
  }, [collaborationUrl, loadChatHistory, loadNotes, openRoom]);

  const loadEndReviews = useCallback(async () => {
    const endpoint = openRoom
      ? sessionUrl + "/reviews/pending"
      : "/api/reviews/pending";
    const response = await fetch(endpoint, { credentials: "include" });
    const payload = await readApi<{ reviews?: EndReview[]; error?: string }>(response);
    if (!response.ok) throw new Error(payload.error || "Couldn’t load session reviews.");
    const reviews = openRoom
      ? payload.reviews || []
      : (payload.reviews || []).filter((review) => review.sessionId === sessionId);
    setPendingEndReviews(reviews);
    if (reviews.length) setEndMessage("Session ended. Leave a rating for your learning partner.");
    return reviews;
  }, [openRoom, sessionUrl, sessionId]);

  const loadSession = useCallback(async () => {
    if (sessionLoadInFlightRef.current) return;
    sessionLoadInFlightRef.current = true;
    try {
      const response = await fetch(sessionUrl, { credentials: "include", signal: AbortSignal.timeout(45_000) });
      const payload = await readApi<{ session?: LearningSession; room?: LearningSession; error?: string }>(response);
      const details = payload.session || payload.room;
      if (!response.ok || !details) throw new Error(payload.error || "Learning session not found.");
      setSession(details);
      setLoadError("");
      if (!openRoom && endRequestedRef.current && details.status === "completed") {
        try { await loadEndReviews(); } catch { /* the regular sessions page remains available if this request fails */ }
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "TimeoutError") {
        throw new Error("The learning server took too long to respond. Try loading the room again.");
      }
      throw cause;
    } finally {
      sessionLoadInFlightRef.current = false;
    }
  }, [sessionUrl, openRoom, sessionId, loadEndReviews]);

  useEffect(() => {
    void loadSession().catch((cause: unknown) => setLoadError(cause instanceof Error ? cause.message : "Couldn’t load this session.")).finally(() => setLoading(false));
    const timer = window.setInterval(() => { setClock(Date.now()); void loadSession().catch((cause: unknown) => setLoadError(cause instanceof Error ? cause.message : "Couldn’t load this session.")); }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadSession]);
  useEffect(() => { if (localVideo.current) localVideo.current.srcObject = localStreamRef.current; }, [joined]);

  const retryLoadSession = () => {
    setLoading(true);
    setLoadError("");
    void loadSession()
      .catch((cause: unknown) => setLoadError(cause instanceof Error ? cause.message : "Couldn’t load this learning room."))
      .finally(() => setLoading(false));
  };

  const closePeers = () => {
    for (const peer of peersRef.current.values()) { peer.ontrack = null; peer.onicecandidate = null; peer.close(); }
    peersRef.current.clear(); setRemoteStreams({}); setConnectedPeers([]);
  };
  const sendSignal = (type: "offer" | "answer" | "ice", to: string, payload: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, to, payload }));
  };

  const createPeer = (peerId: string, peerName: string) => {
    const current = peersRef.current.get(peerId);
    if (current) return current;
    const peer = new RTCPeerConnection({ iceServers: iceServersRef.current });
    peersRef.current.set(peerId, peer);
    const localTracks = localStreamRef.current?.getTracks() || [];
    for (const track of localTracks) peer.addTrack(track, localStreamRef.current!);
    // Keep a video m-line in audio-only offers so the teacher can still send video to this learner.
    if (!localTracks.some((track) => track.kind === "video")) peer.addTransceiver("video", { direction: "sendrecv" });
    peer.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setRemoteStreams((currentStreams) => ({ ...currentStreams, [peerId]: { id: peerId, name: peerName, stream } }));
    };
    peer.onicecandidate = (event) => { if (event.candidate) sendSignal("ice", peerId, event.candidate.toJSON()); };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setConnectedPeers((currentPeers) => currentPeers.includes(peerId) ? currentPeers : [...currentPeers, peerId]);
        setConnection((value) => value.includes("connected") ? value : "Connected to room; waiting for other learners…");
      } else {
        setConnectedPeers((currentPeers) => currentPeers.filter((id) => id !== peerId));
        if (peer.connectionState === "disconnected") setConnection("A participant’s network is interrupted; reconnecting…");
        if (peer.connectionState === "failed") { setConnection("A media route failed; reconnecting to the room…"); socketRef.current?.close(4003, "Restarting media session"); }
      }
    };
    return peer;
  };

  const negotiate = async (peerId: string, peerName: string) => {
    const peer = createPeer(peerId, peerName);
    if (peer.signalingState !== "stable") return;
    try { const offer = await peer.createOffer(); await peer.setLocalDescription(offer); sendSignal("offer", peerId, peer.localDescription!); }
    catch { setError("Couldn’t start a participant’s video connection. Check the network and try again."); }
  };

  const connectSignaling = async (iceServers: RTCIceServer[]) => {
    if (shouldLeaveRef.current) return;
    closePeers();
    const signalingPath = (openRoom ? "/api/open-learning-rooms/" + encodeURIComponent(openRoomId) : "/api/meetings/" + encodeURIComponent(sessionId)) + "/signaling";
    const ticketPath = signalingPath.replace(/\/signaling$/, "/signaling-ticket");
    try {
      const ticketResponse = await fetch(ticketPath, { method: "POST", credentials: "include" });
      const ticketPayload = await readApi<{ ticket?: string; error?: string }>(ticketResponse);
      if (!ticketResponse.ok || !ticketPayload.ticket) throw new Error(ticketPayload.error || "Couldn’t authorize the meeting connection. Rejoin and try again.");
      const localDevelopment = ["localhost", "127.0.0.1"].includes(window.location.hostname);
      const signalingOrigin = import.meta.env.VITE_API_BASE_URL || (localDevelopment ? window.location.origin : "https://swapskil1-1.onrender.com");
      const signalingUrl = new URL(signalingPath, signalingOrigin);
      signalingUrl.protocol = signalingUrl.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(signalingUrl, ["skillswap", ticketPayload.ticket]);
      socketRef.current = socket; setConnection("Connecting to the learning room…");
      socket.onopen = () => { retryRef.current = 0; setConnection("In the room; waiting for participants…"); };
      socket.onmessage = (event) => {
        let message: Signal;
        try { message = JSON.parse(String(event.data)) as Signal; } catch { setError("The meeting server sent an invalid response."); return; }
        if (message.type === "joined") {
          void loadChatHistory().catch(() => {});
          const others = message.participants || [];
          setConnection(others.length ? `Connecting to ${others.length} participant${others.length === 1 ? "" : "s"}…` : "Room is open; waiting for learners to join…");
          for (const other of others) {
            createPeer(other.id, other.fullName);
            if (user.id.localeCompare(other.id) < 0) void negotiate(other.id, other.fullName);
          }
        } else if (message.type === "peer_joined" && message.participant) {
          createPeer(message.participant.id, message.participant.fullName);
          if (user.id.localeCompare(message.participant.id) < 0) void negotiate(message.participant.id, message.participant.fullName);
        } else if (message.type === "offer" && message.from && message.payload) {
          const peer = createPeer(message.from, message.fromName || "Participant");
          void (async () => { try { await peer.setRemoteDescription(new RTCSessionDescription(message.payload as RTCSessionDescriptionInit)); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); sendSignal("answer", message.from!, peer.localDescription!); } catch { setError("Couldn’t connect to a participant. Rejoin the room and try again."); } })();
        } else if (message.type === "answer" && message.from && message.payload) {
          void peersRef.current.get(message.from)?.setRemoteDescription(new RTCSessionDescription(message.payload as RTCSessionDescriptionInit)).catch(() => setError("Couldn’t complete a participant’s video connection."));
        } else if (message.type === "ice" && message.from && message.payload) {
          void peersRef.current.get(message.from)?.addIceCandidate(new RTCIceCandidate(message.payload as RTCIceCandidateInit)).catch(() => {});
        } else if (message.type === "peer_left" && message.participantId) {
          peersRef.current.get(message.participantId)?.close(); peersRef.current.delete(message.participantId);
          setRemoteStreams((streams) => { const next = { ...streams }; delete next[message.participantId!]; return next; });
          setConnectedPeers((peers) => peers.filter((id) => id !== message.participantId));
          setConnection("A participant left the room.");
        } else if (message.type === "chat" && message.chatMessage) {
          setChatMessages((current) => current.some((item) => item.id === message.chatMessage!.id) ? current : [...current, message.chatMessage!].slice(-100));
        } else if (message.type === "chat_error") setChatError(message.message || "Couldn’t send your message.");
        else if (message.type === "error") setError(message.message || "Meeting signaling error.");
        else if (message.type === "replaced") { shouldLeaveRef.current = true; setError("This account joined the room in another tab."); for (const track of localStreamRef.current?.getTracks() || []) track.stop(); localStreamRef.current = null; setJoined(false); closePeers(); }
      };
      socket.onerror = () => setConnection("Room signaling connection interrupted.");
      socket.onclose = (event) => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        if (shouldLeaveRef.current) return;
        closePeers();
        if ([4401, 4002, 4409].includes(event.code)) { setError(event.code === 4401 ? "Your sign-in session expired. Sign in again to rejoin." : event.code === 4409 ? "This room was cancelled, completed, or has ended." : "This learning room is full (8 participants maximum)."); setConnection("Disconnected"); return; }
        const attempt = retryRef.current + 1; retryRef.current = attempt;
        if (attempt > 5) { setError("Couldn’t reconnect to the room. Check your network and rejoin."); setConnection("Disconnected"); return; }
        setConnection("Reconnecting to the room…");
        retryTimerRef.current = window.setTimeout(() => { void connectSignaling(iceServers); }, Math.min(1000 * 2 ** (attempt - 1), 10_000));
      };
    } catch (cause) {
      setConnection("Disconnected");
      setError(cause instanceof Error ? cause.message : "Couldn’t authorize the meeting connection. Rejoin and try again.");
    }
  };

  const sendChatMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = chatDraft.trim();
    const socket = socketRef.current;
    if (!body || body.length > 2000 || socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "chat", body }));
    setChatDraft(""); setChatError("");
  };

  const saveNotes = async () => {
    setNotesSaving(true); setNotesError(""); setNotesSaved(false);
    try {
      const response = await fetch(collaborationUrl + "/notes", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) });
      const payload = await readApi<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Couldn’t save your notes.");
      setNotesSaved(true);
    } catch (cause) { setNotesError(cause instanceof Error ? cause.message : "Couldn’t save your notes."); }
    finally { setNotesSaving(false); }
  };

  const join = async () => {
    if (!session?.scheduledAt) return;
    setBusy(true); setError(""); setMediaNotice(""); setCameraUnavailable(false); setCameraOff(false); shouldLeaveRef.current = false;
    try {
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (mediaError) {
        const cameraBusy = mediaError instanceof DOMException && ["NotReadableError", "TrackStartError", "AbortError"].includes(mediaError.name);
        if (!cameraBusy) throw mediaError;
        try {
          media = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          setCameraOff(true);
          setCameraUnavailable(true);
          setMediaNotice("Your camera is already in use by another tab or app. You joined with your microphone; close the other video session and rejoin to use your camera.");
        } catch {
          throw new Error("Your camera or microphone is already in use by another tab or app. Close the other video session and try again.");
        }
      }
      localStreamRef.current = media;
      if (localVideo.current) localVideo.current.srcObject = media;
      if (openRoom) {
        const joinedResponse = await fetch(sessionUrl + "/join", { method: "POST", credentials: "include" });
        const joinedPayload = await readApi<{ error?: string }>(joinedResponse);
        if (!joinedResponse.ok) throw new Error(joinedPayload.error || "Couldn’t join this learning room.");
        joinedOpenRoomRef.current = true;
        void loadChatHistory().catch((cause: unknown) => setChatError(cause instanceof Error ? cause.message : "Couldn’t load meeting messages."));
        void loadNotes().catch((cause: unknown) => setNotesError(cause instanceof Error ? cause.message : "Couldn’t load your private notes."));
      }
      const response = await fetch(sessionUrl + "/ice-servers", { credentials: "include" });
      const payload = await readApi<{ iceServers?: RTCIceServer[]; error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "This learning room is not open yet.");
      iceServersRef.current = payload.iceServers || []; setJoined(true); connectSignaling(iceServersRef.current);
    } catch (cause) {
      for (const track of localStreamRef.current?.getTracks() || []) track.stop(); localStreamRef.current = null;
      setMediaNotice(""); setCameraUnavailable(false); setCameraOff(false);
      if (openRoom && joinedOpenRoomRef.current && session?.createdBy !== user.id) { void fetch(sessionUrl + "/leave", { method: "POST", credentials: "include" }); joinedOpenRoomRef.current = false; }
      if (cause instanceof DOMException && ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(cause.name)) setError("Camera or microphone access was denied. Allow access in your browser settings, then try again.");
      else if (!window.isSecureContext) setError("This page is not using a trusted HTTPS connection, so the phone has disabled camera and microphone access. Install the SkillSwap Local Development CA certificate on the phone, then open the https:// LAN address printed by ./scripts/setup-mobile-https.sh.");
      else if (!navigator.mediaDevices?.getUserMedia) setError("This browser does not provide camera and microphone access. Open this page in an up-to-date Chrome browser over the trusted HTTPS address, then try again.");
      else setError(cause instanceof Error ? cause.message : "Couldn’t join the learning room.");
    } finally { setBusy(false); }
  };

  const retryCamera = async () => {
    setError(""); setMediaNotice("");
    shouldLeaveRef.current = true;
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    socketRef.current?.close(1000, "Retrying camera"); socketRef.current = null; closePeers();
    for (const track of localStreamRef.current?.getTracks() || []) track.stop();
    localStreamRef.current = null; setJoined(false); setCameraUnavailable(false); setCameraOff(false);
    await join();
  };

  const leave = async () => {
    setEndError("");
    shouldLeaveRef.current = true; if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    socketRef.current?.close(1000, "Participant left"); socketRef.current = null; closePeers();
    for (const track of localStreamRef.current?.getTracks() || []) track.stop(); localStreamRef.current = null;
    setJoined(false); setConnection("You left the learning room.");
    endRequestedRef.current = true;
    if (openRoom) {
      const closingRoom = session?.createdBy === user.id;
      try {
        const response = await fetch(closingRoom ? sessionUrl : sessionUrl + "/leave", {
          method: closingRoom ? "PATCH" : "POST", credentials: "include",
          ...(closingRoom ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close" }) } : {}),
        });
        const payload = await readApi<{ error?: string }>(response);
        if (!response.ok) throw new Error(payload.error || "Couldn’t end the room.");
        const reviews = await loadEndReviews();
        if (!reviews.length) setEndMessage("Room ended. There are no ratings waiting for you.");
      } catch (cause) { setEndError(cause instanceof Error ? cause.message : "Couldn’t finish the room."); }
      joinedOpenRoomRef.current = false;
    } else if (session) {
      try {
        const response = await fetch("/api/learning-sessions/" + encodeURIComponent(session.id) + "/confirm-completion", { method: "POST", credentials: "include" });
        const payload = await readApi<{ session?: { status?: string }; error?: string }>(response);
        if (!response.ok) throw new Error(payload.error || "Couldn’t finish this session.");
        if (payload.session?.status === "completed") {
          setSession((current) => current ? { ...current, status: "completed", meetingStatus: "completed" } : current);
          const reviews = await loadEndReviews();
          if (!reviews.length) setEndMessage("Session completed. No rating is waiting for you.");
        } else {
          setEndMessage("Your completion is saved. Waiting for the other participant; the rating form will appear here when they finish.");
        }
      } catch (cause) { setEndError(cause instanceof Error ? cause.message : "Couldn’t finish this session."); }
    }
  };

  const submitEndReview = async (review: EndReview) => {
    const recipientId = review.recipient.id;
    const stars = endReviewStars[recipientId];
    if (!stars) { setEndError("Choose a star rating from 1 to 5."); return; }
    setReviewSubmitting(recipientId); setEndError("");
    try {
      const response = review.roomId
        ? await fetch("/api/open-learning-rooms/" + encodeURIComponent(review.roomId) + "/reviews", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId, stars, reviewText: endReviewTexts[recipientId] || "" }) })
        : await fetch("/api/reviews", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: review.sessionId, stars, reviewText: endReviewTexts[recipientId] || "" }) });
      const payload = await readApi<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Couldn’t submit your rating.");
      await loadEndReviews();
      setEndMessage("Your rating was submitted. Thank you for sharing your experience.");
    } catch (cause) { setEndError(cause instanceof Error ? cause.message : "Couldn’t submit your rating."); }
    finally { setReviewSubmitting(""); }
  };
  useEffect(() => () => { shouldLeaveRef.current = true; if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current); socketRef.current?.close(); for (const peer of peersRef.current.values()) peer.close(); for (const track of localStreamRef.current?.getTracks() || []) track.stop(); }, []);

  const toggleAudio = () => { const next = !muted; for (const track of localStreamRef.current?.getAudioTracks() || []) track.enabled = !next; setMuted(next); };
  const toggleCamera = () => { const next = !cameraOff; for (const track of localStreamRef.current?.getVideoTracks() || []) track.enabled = !next; setCameraOff(next); };
  const startAt = session?.scheduledAt ? Date.parse(session.scheduledAt) : NaN;
  const endAt = startAt + (session?.durationMinutes || 0) * 60_000;
  const joinAvailable = Number.isFinite(startAt) && clock >= startAt - 10 * 60_000 && clock <= endAt && session?.meetingStatus !== "cancelled" && session?.meetingStatus !== "completed";
  const visibleParticipants = session?.participants || [];
  const teacherParticipant = visibleParticipants.find((participant) => participant.role === "teacher");
  const teacherId = teacherParticipant?.id || session?.createdBy || "";
  const teacherName = teacherParticipant?.fullName || (teacherId === user.id ? user.fullName : "Teacher");
  const teacherIsLocal = teacherId === user.id;
  const teacherRemote = teacherId ? remoteStreams[teacherId] : undefined;
  const otherRemoteStreams = Object.values(remoteStreams).filter((participant) => participant.id !== teacherId);

  return <WorkspaceShell user={user} title="Online learning room" eyebrow="SkillSwap video room" description={openRoom ? "Learn live with the host and other students in this open room." : "Join the teacher and other learners in your accepted skill exchange room."} onLogout={onLogout} loggingOut={loggingOut} logoutError={logoutError}>
    {error && session && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    {endError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{endError}</p>}
    {endMessage && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{endMessage}</p>}
    {loading ? <p role="status" className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-slate-600">Loading room details… If this is the first visit, the learning server may take a little while to wake up.</p> : !session ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{loadError || "This learning room is unavailable."}<button type="button" onClick={retryLoadSession} className="ml-3 inline-flex min-h-9 items-center rounded-full border border-red-300 bg-white px-4 text-sm font-semibold text-red-900 hover:bg-red-100">Try again</button></div> : <>
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-ink/10 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">{session.meetingStatus}</p><h2 className="mt-1 font-display text-xl font-semibold">{session.title}</h2><p className="mt-1 text-sm text-slate-600">{session.skill || session.skillName || "Learning session"} · {session.durationMinutes} minutes · {session.scheduledAt ? formatTime(new Date(session.scheduledAt)) : "Not scheduled"}</p></div><a href="/learning-rooms" className="inline-flex min-h-10 items-center rounded-full border border-ink/15 px-4 text-sm font-semibold">Back to learning rooms</a></div>
      {session.description && <p className="mb-5 rounded-xl bg-white p-4 text-sm leading-6 text-slate-700">{session.description}</p>}
      <section aria-label="Meeting video" className="space-y-4">
        <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-3xl bg-[#172b27] text-white">
          {teacherIsLocal ? <div className="relative aspect-video"><video ref={localVideo} autoPlay playsInline muted className="size-full object-cover" />{(!joined || cameraOff) && <div className="absolute inset-0 grid place-items-center text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-full bg-white/10 text-xl font-bold">{user.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span><p className="mt-3 text-sm">{joined ? "Camera is off." : "Your camera preview appears here after you join."}</p></div></div>}<span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1.5 text-xs">{user.fullName} · Teacher{muted ? " · muted" : ""}{cameraOff ? " · camera off" : ""}</span></div>
            : teacherRemote ? <div className="relative"><RemoteVideo participant={teacherRemote} connected={connectedPeers.includes(teacherRemote.id)} /><span className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1.5 text-xs">Teacher</span></div>
              : <div className="grid aspect-video place-items-center p-6 text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-full bg-white/10 text-xl font-bold">{teacherName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span><p className="mt-3 text-sm">Waiting for {teacherName}’s video…</p></div></div>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {!teacherIsLocal && <div className="relative aspect-video overflow-hidden rounded-3xl bg-[#172b27] text-white"><video ref={localVideo} autoPlay playsInline muted className="size-full object-cover" />{(!joined || cameraOff) && <div className="absolute inset-0 grid place-items-center text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-full bg-white/10 text-lg font-bold">{user.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span><p className="mt-3 text-sm">{joined ? "Camera is off." : "Your camera preview appears here after you join."}</p></div></div>}<span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1.5 text-xs">You · {muted ? "muted" : "mic on"}{cameraOff ? " · camera off" : ""}</span></div>}
          {otherRemoteStreams.map((participant) => <RemoteVideo key={participant.id} participant={participant} connected={connectedPeers.includes(participant.id)} />)}
          {joined && otherRemoteStreams.length === 0 && !teacherIsLocal && <div className="grid aspect-video place-items-center rounded-3xl bg-[#172b27] p-6 text-center text-white"><p className="text-sm">Other learners will appear here when they join.</p></div>}
        </div>
      </section>
      {mediaNotice && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{mediaNotice}</p>}
      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><p role="status" className="text-sm text-slate-700">{connection}{joined ? ` · ${connectedPeers.length} connected` : ""}</p><div className="flex flex-wrap gap-2">{!joined ? <button type="button" onClick={() => void join()} disabled={busy || !joinAvailable} className="min-h-11 rounded-full bg-forest px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Starting media…" : joinAvailable ? "Join room" : session.meetingStatus === "upcoming" ? "Waiting for start time" : "Room unavailable"}</button> : <><button type="button" onClick={toggleAudio} className="min-h-11 rounded-full border border-ink/15 px-4 text-sm font-semibold hover:bg-paper">{muted ? "Unmute microphone" : "Mute microphone"}</button>{cameraUnavailable ? <button type="button" onClick={() => void retryCamera()} disabled={busy} className="min-h-11 rounded-full border border-ink/15 px-4 text-sm font-semibold hover:bg-paper disabled:opacity-60">{busy ? "Retrying camera…" : "Retry camera"}</button> : <button type="button" onClick={toggleCamera} className="min-h-11 rounded-full border border-ink/15 px-4 text-sm font-semibold hover:bg-paper">{cameraOff ? "Turn camera on" : "Turn camera off"}</button>}<button type="button" onClick={() => void leave()} className="min-h-11 rounded-full bg-red-700 px-5 text-sm font-semibold text-white hover:bg-red-800">{openRoom ? session.createdBy === user.id ? "End room" : "Leave room & review" : teacherIsLocal ? "End session" : "End session & review"}</button></>}</div></div>
      {pendingEndReviews.length > 0 && <section aria-labelledby="end-session-review-title" className="mt-5 space-y-4 rounded-2xl border border-emerald-900/15 bg-[#f1f6ec] p-5 sm:p-6">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Session feedback</p><h3 id="end-session-review-title" className="mt-1 font-display text-xl font-semibold">How was your learning experience?</h3><p className="mt-1 text-sm text-slate-600">Your review is private until submitted and helps students learn from each other.</p></div>
        {pendingEndReviews.map((review) => {
          const recipientId = review.recipient.id;
          const ratingLabel = review.ratingType === "teacher" ? "Rate your teacher" : "Rate your learner";
          return <form key={recipientId} onSubmit={(event) => { event.preventDefault(); void submitEndReview(review); }} className="rounded-xl border border-ink/10 bg-white p-4">
            <h4 className="font-semibold text-ink">{ratingLabel}: {review.recipient.fullName}</h4><p className="mt-1 text-sm text-slate-600">{review.skillName}</p>
            <fieldset className="mt-4"><legend className="text-sm font-semibold">Your rating</legend><div className="mt-2 flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map((value) => <label key={value} className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-forest ${endReviewStars[recipientId] === value ? "border-forest bg-[#e9f1ed] text-forest" : "border-ink/15 hover:bg-paper"}`}><input className="sr-only" type="radio" name={`meeting-rating-${recipientId}`} value={value} checked={endReviewStars[recipientId] === value} onChange={() => setEndReviewStars((current) => ({ ...current, [recipientId]: value }))} /><span aria-hidden="true">★</span><span>{value}</span><span className="sr-only">{value} {value === 1 ? "star" : "stars"}</span></label>)}</div></fieldset>
            <label htmlFor={`meeting-review-${recipientId}`} className="mt-4 block text-sm font-semibold">Written review <span className="font-normal text-slate-500">(optional)</span></label><textarea id={`meeting-review-${recipientId}`} value={endReviewTexts[recipientId] || ""} onChange={(event) => setEndReviewTexts((current) => ({ ...current, [recipientId]: event.target.value }))} maxLength={1000} rows={3} placeholder="Share what you learned or appreciated…" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-forest" />
            <button type="submit" disabled={reviewSubmitting === recipientId} className="mt-3 min-h-11 rounded-full bg-forest px-5 text-sm font-semibold text-white hover:bg-emerald-950 disabled:opacity-60">{reviewSubmitting === recipientId ? "Submitting…" : "Submit rating"}</button>
          </form>;
        })}
      </section>}
      <section className="mt-5 rounded-2xl border border-ink/10 bg-white p-5"><h3 className="font-semibold">Participants · {visibleParticipants.length}/8</h3><ul className="mt-3 flex flex-wrap gap-3">{visibleParticipants.map((participant) => <li key={participant.id} className="flex items-center gap-2 rounded-full bg-paper px-3 py-2 text-sm"><span className="grid size-7 place-items-center rounded-full bg-[#e4f0dc] text-xs font-bold text-forest">{participant.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span>{participant.fullName} · {participant.role}{participant.id === user.id ? " (you)" : joined && connectedPeers.includes(participant.id) ? " · connected" : " · not connected"}</li>)}</ul><p className="mt-3 text-xs leading-5 text-slate-500">The teacher hosts this private room. Only learners invited through an accepted exchange can join. Video connects peer-to-peer; a TURN server may be needed on restrictive networks.</p></section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-ink/10 bg-white" aria-label="Meeting chat and notes">
        <div className="flex gap-2 border-b border-ink/10 p-3" role="tablist" aria-label="Meeting tools">
          <button type="button" role="tab" aria-selected={collaborationTab === "chat"} onClick={() => setCollaborationTab("chat")} className={`min-h-10 rounded-full px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest ${collaborationTab === "chat" ? "bg-forest text-white" : "hover:bg-paper"}`}>Room messages</button>
          <button type="button" role="tab" aria-selected={collaborationTab === "notes"} onClick={() => setCollaborationTab("notes")} className={`min-h-10 rounded-full px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest ${collaborationTab === "notes" ? "bg-forest text-white" : "hover:bg-paper"}`}>My private notes</button>
        </div>
        {collaborationTab === "chat" ? <div role="tabpanel" className="p-4">
          <p className="mb-3 text-sm text-slate-600">Messages are visible to everyone in this learning room.</p>
          {chatError && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{chatError}</p>}
          <ol aria-live="polite" aria-label="Room messages" className="mb-3 flex max-h-80 min-h-28 flex-col gap-3 overflow-y-auto rounded-xl bg-paper p-3">
            {chatMessages.length === 0 ? <li className="m-auto py-8 text-center text-sm text-slate-500">No messages yet. Start the conversation.</li> : chatMessages.map((item) => <li key={item.id} className="max-w-[90%] rounded-xl bg-white px-3 py-2 shadow-sm">
              <div className="flex flex-wrap items-baseline gap-x-2"><span className="text-sm font-semibold">{item.senderId === user.id ? "You" : item.senderName}</span><time className="text-xs text-slate-500" dateTime={item.createdAt}>{new Date(item.createdAt.replace(" ", "T") + (item.createdAt.endsWith("Z") ? "" : "Z")).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>
              <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>
            </li>)}
          </ol>
          <form onSubmit={sendChatMessage} className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="meeting-chat-draft">Write a room message</label>
            <input id="meeting-chat-draft" value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={2000} placeholder={joined ? "Write a message…" : "Join the room to send messages"} disabled={!joined} className="min-h-11 min-w-0 flex-1 rounded-xl border border-ink/15 px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest disabled:bg-slate-50" />
            <button type="submit" disabled={!joined || !chatDraft.trim()} className="min-h-11 rounded-xl bg-forest px-5 text-sm font-semibold text-white hover:bg-forest/90 disabled:opacity-50">Send</button>
          </form>
          <p className="mt-2 text-right text-xs text-slate-500">{chatDraft.length}/2,000</p>
        </div> : <div role="tabpanel" className="p-4">
          <div className="mb-3"><h3 className="font-semibold">Your notes</h3><p className="text-sm text-slate-600">Only you can see these notes. They are saved for this learning room.</p></div>
          {notesError && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{notesError}</p>}
          <label className="sr-only" htmlFor="meeting-private-notes">Private learning room notes</label>
          <textarea id="meeting-private-notes" value={notes} onChange={(event) => { setNotes(event.target.value); setNotesSaved(false); }} maxLength={10000} rows={7} placeholder="Write down key points, examples, or questions…" className="w-full resize-y rounded-xl border border-ink/15 px-4 py-3 text-sm leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span aria-live="polite" className="text-sm text-slate-600">{notesSaved ? "Notes saved." : `${notes.length}/10,000 characters`}</span><button type="button" onClick={() => void saveNotes()} disabled={notesSaving || notes.length > 10000} className="min-h-11 rounded-xl bg-forest px-5 text-sm font-semibold text-white hover:bg-forest/90 disabled:opacity-50">{notesSaving ? "Saving…" : "Save notes"}</button></div>
        </div>}
      </section>
    </>}
  </WorkspaceShell>;
}
