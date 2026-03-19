// src/app/room/[roomId]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase';

type RoomRow = {
  id: string;
  revealed_prefix: string;
  secret_word: string | null;
};

type PlayerRow = {
  id: string;
  room_id: string;
  nickname: string;
  is_gm: boolean;
};

type AttemptRow = {
  id: string;
  room_id: string;
  clue: string | null;
  initiator_id: string | null;
  responder_id: string | null;
  word_initiator: string | null;
  word_responder: string | null;
  status: string;
  interrupted: boolean;
  countdown: number;
};

type ChatRow = {
  id: string;
  room_id: string;
  username: string;
  message: string;
  created_at: string;
};

type UsedWordRow = {
  id: string;
  room_id: string;
  normalized_word: string;
};

const normalizeWord = (w: string) => w.toLowerCase().replace(/[^a-z]/g, '');

export default function RoomPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const params = useParams();
  const roomId = (params?.roomId as string) || 'demo';

  // Local identity
  const [nicknameInput, setNicknameInput] = useState('');
  const [me, setMe] = useState<PlayerRow | null>(null);

  // Room state
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [attempt, setAttempt] = useState<AttemptRow | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatRow[]>([]);
  const [usedWords, setUsedWords] = useState<string[]>([]);

  // UI modals
  const [showInitiatorModal, setShowInitiatorModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showGuessModal, setShowGuessModal] = useState(false);

  // Form fields
  const [initiatorWord, setInitiatorWord] = useState('');
  const [clueWord, setClueWord] = useState('');
  const [connectWord, setConnectWord] = useState('');
  const [guessWord, setGuessWord] = useState('');
  const [chatInput, setChatInput] = useState('');

  const isGm = !!me?.is_gm;
  const isInitiator = attempt && me && attempt.initiator_id === me.id;

  // --------- JOIN ROOM ---------

  const joinRoom = async () => {
    const nick = nicknameInput.trim();
    if (!nick) return;

    // 1) Ensure room row exists (demo already seeded in SQL).
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single<RoomRow>();
    if (roomError) {
      alert('Could not load room: ' + roomError.message);
      return;
    }
    setRoom(roomData);

    // 2) Decide if this player is GM (first player in this room).
    const { data: existingPlayers } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', roomId);
    const willBeGm = !existingPlayers || existingPlayers.length === 0;

    const playerId = 'p_' + crypto.randomUUID();

    const { data: inserted, error: insertError } = await supabase
      .from('players')
      .insert({
        id: playerId,
        room_id: roomId,
        nickname: nick,
        is_gm: willBeGm,
      })
      .select('*')
      .single<PlayerRow>();

    if (insertError) {
      alert('Could not join room: ' + insertError.message);
      return;
    }

    setMe(inserted);
    // Store in localStorage to keep same identity on refresh
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('guessir_player_id', inserted.id);
      window.localStorage.setItem('guessir_nickname', inserted.nickname);
    }
  };

  // --------- INITIAL LOAD AFTER JOIN ---------

  useEffect(() => {
    if (!me) return;

    let ignore = false;

    const loadInitial = async () => {
      // Room
      const { data: roomData } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single<RoomRow>();
      if (!ignore && roomData) setRoom(roomData);

      // Players
      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .order('joined_at', { ascending: true });
      if (!ignore && playersData) setPlayers(playersData as PlayerRow[]);

      // Last attempt (not complete)
      const { data: attemptsData } = await supabase
        .from('attempts')
        .select('*')
        .eq('room_id', roomId)
        .neq('status', 'complete')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!ignore && attemptsData && attemptsData.length > 0) {
        setAttempt(attemptsData[0] as AttemptRow);
      } else if (!ignore) {
        setAttempt(null);
      }

      // Used words
      const { data: usedData } = await supabase
        .from('used_words')
        .select('*')
        .eq('room_id', roomId);
      if (!ignore && usedData) {
        setUsedWords(
          (usedData as UsedWordRow[]).map((u) => u.normalized_word),
        );
      }

      // Chat
      const { data: chatData } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (!ignore && chatData) setChatMessages(chatData as ChatRow[]);
    };

    loadInitial();

    return () => {
      ignore = true;
    };
  }, [me, roomId, supabase]);


    useEffect(() => {
    const dbg = supabase
      .channel('debug-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attempts' },
        (payload) => {
          console.log('DEBUG ATTEMPT INSERT', payload);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dbg);
    };
  }, [supabase]);

  // --------- REALTIME SUBSCRIPTIONS ---------

  useEffect(() => {
    if (!me) return;

    const channel = supabase
      .channel(`room:${roomId}`)
      // rooms
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload: any) => {
          setRoom(payload.new as RoomRow);
        },
      )
      // players
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          setPlayers((prev) => {
            const row = payload.new as PlayerRow;
            if (payload.eventType === 'INSERT') {
              const exists = prev.find((p) => p.id === row.id);
              if (exists) return prev;
              return [...prev, row];
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map((p) => (p.id === row.id ? row : p));
            }
            if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as PlayerRow;
              return prev.filter((p) => p.id !== oldRow.id);
            }
            return prev;
          });
        },
      )
      // attempts
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attempts', filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          const row = payload.new as AttemptRow;
          if (payload.eventType === 'INSERT') {
            setAttempt(row);
          } else if (payload.eventType === 'UPDATE') {
            setAttempt(row.status === 'complete' ? null : row);
          } else if (payload.eventType === 'DELETE') {
            setAttempt(null);
          }
        },
      )
      // chat
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          const row = payload.new as ChatRow;
          setChatMessages((prev) => [...prev, row]);
        },
      )
      // used_words
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'used_words', filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          const row = payload.new as UsedWordRow;
          setUsedWords((prev) => [...prev, row.normalized_word]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, roomId, supabase]);

  // --------- ACTIONS ---------

  const openInitiator = () => {
    setInitiatorWord('');
    setClueWord('');
    setShowInitiatorModal(true);
  };
  const closeInitiator = () => setShowInitiatorModal(false);

  const openConnect = () => {
    setConnectWord('');
    setShowConnectModal(true);
  };
  const closeConnect = () => setShowConnectModal(false);

  const openGuess = () => {
    setGuessWord('');
    setShowGuessModal(true);
  };
  const closeGuess = () => setShowGuessModal(false);

  const submitInitiator = async () => {
    if (!me || !room) return;
    const prefix = room.revealed_prefix;
    if (!initiatorWord.toUpperCase().startsWith(prefix.toUpperCase())) {
      alert(`Word must start with ${prefix}`);
      return;
    }
    if (!clueWord.trim()) {
      alert('Enter a one-word clue');
      return;
    }

    const { error } = await supabase.from('attempts').insert({
      room_id: roomId,
      clue: clueWord.trim(),
      initiator_id: me.id,
      word_initiator: initiatorWord.trim(),
      status: 'waiting_connect',
    });

    if (error) {
      alert('Could not start attempt: ' + error.message);
      return;
    }

    closeInitiator();
  };

  const submitConnect = async () => {
    if (!me || !attempt || !room) return;
    if (!connectWord.trim()) return;

    // Set responder + word and mark as countdown
    const { data: updatedAttempts, error } = await supabase
      .from('attempts')
      .update({
        responder_id: me.id,
        word_responder: connectWord.trim(),
        status: 'countdown',
      })
      .eq('id', attempt.id)
      .select('*')
      .single<AttemptRow>();

    if (error) {
      alert('Could not connect: ' + error.message);
      return;
    }

    // Local 3s countdown; on completion, this client decides success/fail
    closeConnect();

    setTimeout(async () => {
      const initiatorNorm = normalizeWord(
        updatedAttempts.word_initiator || '',
      );
      const responderNorm = normalizeWord(
        updatedAttempts.word_responder || '',
      );
      const alreadyUsed = usedWords.includes(initiatorNorm);

      const success =
        initiatorNorm.length > 0 &&
        initiatorNorm === responderNorm &&
        !alreadyUsed &&
        !updatedAttempts.interrupted;

      if (success) {
        // Reveal next letter from secret_word
        const { data: freshRoom } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', roomId)
          .single<RoomRow>();

        if (freshRoom && freshRoom.secret_word) {
          const nextLen = freshRoom.revealed_prefix.length + 1;
          const newPrefix = freshRoom.secret_word.slice(0, nextLen);

          await supabase
            .from('rooms')
            .update({ revealed_prefix: newPrefix })
            .eq('id', roomId);

          await supabase.from('used_words').insert({
            room_id: roomId,
            normalized_word: initiatorNorm,
          });

          await supabase.from('chat_messages').insert({
            room_id: roomId,
            username: 'System',
            message: `${me.nickname} connected successfully! Prefix is now ${newPrefix}`,
          });
        }
      } else {
        await supabase.from('chat_messages').insert({
          room_id: roomId,
          username: 'System',
          message:
            "Connection failed – words don't match, already used, or interrupted",
        });
      }

      await supabase
        .from('attempts')
        .update({ status: 'complete' })
        .eq('id', updatedAttempts.id);
    }, 3000);
  };

  const handleInterrupt = async () => {
    if (!isGm || !attempt) return;
    await supabase
      .from('attempts')
      .update({ interrupted: true, status: 'complete' })
      .eq('id', attempt.id);
    await supabase.from('chat_messages').insert({
      room_id: roomId,
      username: 'System',
      message: 'GM interrupted the connection!',
    });
  };

  const submitGuess = async () => {
    if (!me || !room) return;
    const guess = guessWord.trim().toUpperCase();
    if (!guess) return;

    const secret = room.secret_word?.toUpperCase();
    if (secret && guess === secret) {
      await supabase.from('chat_messages').insert({
        room_id: roomId,
        username: 'System',
        message: `${me.nickname} guessed correctly! ${secret}`,
      });
      alert(`${me.nickname} wins! Secret word was ${secret}`);
      // You can add GM rotation logic later
    } else {
      await supabase.from('chat_messages').insert({
        room_id: roomId,
        username: 'System',
        message: `${me.nickname} guessed "${guessWord.trim()}" and was wrong`,
      });
    }
    closeGuess();
  };

  const sendChat = async () => {
    if (!me || !chatInput.trim()) return;
    const message = chatInput.trim();
    setChatInput('');
    await supabase.from('chat_messages').insert({
      room_id: roomId,
      username: me.nickname,
      message,
    });
  };

  // --------- RENDER ---------

  if (!me) {
    return (
      <div className="min-h-screen bg-gradient-to-r from-indigo-900 via-purple-900 to-pink-800 flex items-center justify-center p-8">
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-12 w-full max-w-md border border-white/20 shadow-2xl">
          <h1 className="text-4xl font-bold text-white mb-8 text-center tracking-tight">
            Room {roomId.toUpperCase()}
          </h1>
          <input
            value={nicknameInput}
            onChange={(e) => setNicknameInput(e.target.value)}
            placeholder="Enter your nickname to play"
            className="w-full p-5 rounded-2xl bg-white/10 border border-white/20 text-white placeholder-white/50 text-xl mb-8 text-center tracking-wide"
          />
          <button
            onClick={joinRoom}
            disabled={!nicknameInput.trim()}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed p-6 rounded-2xl text-2xl font-bold shadow-xl transition-all"
          >
            Join Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-indigo-900 via-purple-900 to-pink-800 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Top Bar */}
        <div className="flex justify-between items-center mb-8 bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-xl">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Room {roomId.toUpperCase()}
            </h1>
            <div className="flex gap-3 mt-3 flex-wrap">
              {players.map((player) => (
                <div
                  key={player.id}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                    player.is_gm
                      ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-md'
                      : 'bg-white/20 text-white border border-white/30'
                  }`}
                >
                  {player.nickname}
                  {player.id === me.id ? ' (you)' : ''}
                </div>
              ))}
            </div>
          </div>

          <div className="text-center min-w-[200px]">
            <div className="text-6xl font-black bg-white/10 px-8 py-6 rounded-3xl backdrop-blur-xl border-4 border-white/30 shadow-2xl tracking-wider">
              {room?.revealed_prefix || 'T'}
            </div>
            {isGm && room?.secret_word && (
              <div className="mt-4 p-2 bg-black/40 rounded-xl text-xs font-mono opacity-90">
                Secret: {room.secret_word}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-8 mb-12">
          {/* Actions */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-xl">
              <h3 className="text-xl font-bold text-white mb-6 tracking-tight">
                Quick Actions
              </h3>

              {!isGm && !attempt && (
                <button
                  onClick={openInitiator}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 p-6 rounded-xl font-bold text-xl shadow-xl mb-4 transition-all duration-200"
                >
                  Become an Initiator
                </button>
              )}

              {!isGm && attempt && !isInitiator && attempt.status === 'waiting_connect' && (
                <button
                  onClick={openConnect}
                  className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 p-6 rounded-xl font-bold text-xl shadow-xl mb-4 transition-all duration-200"
                >
                  Connect!
                </button>
              )}

              {!isGm && (
                <button
                  onClick={openGuess}
                  className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 p-6 rounded-xl font-bold text-xl shadow-xl transition-all duration-200"
                >
                  Guess the Word
                </button>
              )}

              {isGm && attempt && attempt.status === 'countdown' && (
                <button
                  onClick={handleInterrupt}
                  className="w-full bg-gradient-to-r from-red-500 to-rose-700 hover:from-red-600 hover:to-rose-800 p-6 rounded-xl font-bold text-xl shadow-xl transition-all duration-200 mt-4"
                >
                  Interrupt
                </button>
              )}
            </div>

            {usedWords.length > 0 && (
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-lg">
                <h4 className="font-bold text-white mb-4 text-lg">
                  Used Words ({usedWords.length})
                </h4>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {usedWords.map((word, i) => (
                    <span
                      key={i}
                      className="bg-gray-700/50 px-3 py-1 rounded-full text-sm text-white font-medium"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Center Status */}
          <div className="lg:col-span-1">
            {attempt ? (
              <div
                className={`p-12 rounded-3xl text-center border-4 shadow-2xl transition-all duration-300 h-full flex flex-col justify-center ${
                  attempt.status === 'waiting_connect'
                    ? 'bg-yellow-500/20 border-yellow-500/50 ring-2 ring-yellow-400/30'
                    : attempt.status === 'countdown'
                    ? 'bg-blue-500/20 border-blue-500/50 ring-2 ring-blue-400/30 animate-pulse'
                    : 'bg-emerald-500/20 border-emerald-500/50 ring-2 ring-emerald-400/30'
                }`}
              >
                {attempt.status === 'waiting_connect' && (
                  <>
                    <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">
                      Clue: "{attempt.clue}"
                    </h3>
                    <p className="text-lg opacity-90 mb-8">
                      Waiting for someone to connect...
                    </p>
                  </>
                )}
                {attempt.status === 'countdown' && (
                  <>
                    <h3 className="text-2xl font-bold text-white mb-6 tracking-tight">
                      Connected!
                    </h3>
                    <div className="text-5xl font-black text-blue-300 mb-4 animate-bounce">
                      5
                    </div>
                    <p className="text-lg opacity-90">
                      Counting down and judging words...
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="bg-white/5 backdrop-blur-xl p-12 rounded-3xl border-2 border-dashed border-white/20 text-center shadow-lg h-full flex flex-col justify-center">
                <h3 className="text-xl font-bold text-white/70 mb-2 tracking-tight">
                  No active connection
                </h3>
                <p className="text-white/50 text-lg">
                  Be the first initiator
                </p>
              </div>
            )}
          </div>

          {/* Chat */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-xl">
            <h3 className="text-xl font-bold text-white mb-6 tracking-tight">
              Chat
            </h3>
            <div className="h-80 bg-black/20 rounded-xl p-4 mb-4 overflow-y-auto space-y-2 text-sm">
              {chatMessages.map((msg) => (
                <div key={msg.id} className="flex gap-3">
                  <span className="font-bold text-white/90 w-24 truncate">
                    {msg.username}:
                  </span>
                  <span className="text-white/80 flex-1">{msg.message}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
<input
  value={chatInput}
  onChange={(e) => setChatInput(e.target.value)}
  placeholder="Type a message..."
  className="flex-1 bg-white/10 border border-white/20 rounded-xl p-4 text-white placeholder-white/50 focus:outline-none focus:border-white/50 transition-all"
  onKeyDown={(e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendChat();
    }
  }}
/>

<button
  onClick={sendChat}
  className="bg-blue-500 hover:bg-blue-600 px-8 py-4 rounded-xl font-bold text-white shadow-lg transition-all whitespace-nowrap"
>
  Send
</button>

            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showInitiatorModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50"
          onClick={closeInitiator}
        >
          <div
            className="bg-white/10 backdrop-blur-2xl rounded-3xl p-10 w-full max-w-lg border border-white/20 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-3xl font-bold text-white mb-8 text-center tracking-tight">
              Become Initiator
            </h3>
            <div className="space-y-6">
              <div>
                <label className="block text-white/90 mb-3 font-semibold">
                  Word (must start with {room?.revealed_prefix || 'T'})
                </label>
                <input
                  value={initiatorWord}
                  onChange={(e) => setInitiatorWord(e.target.value)}
                  className="w-full p-5 rounded-2xl bg-white/20 border border-white/30 text-white text-xl placeholder-white/50 focus:border-white/50 focus:outline-none transition-all"
                  placeholder="telephone"
                />
              </div>
              <div>
                <label className="block text-white/90 mb-3 font-semibold">
                  One-word clue
                </label>
                <input
                  value={clueWord}
                  onChange={(e) => setClueWord(e.target.value)}
                  className="w-full p-5 rounded-2xl bg-white/20 border border-white/30 text-white text-xl placeholder-white/50 focus:border-white/50 focus:outline-none transition-all"
                  placeholder="calling"
                />
              </div>
              <div className="flex gap-4 pt-6 border-t border-white/10">
                <button
                  onClick={closeInitiator}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 p-5 rounded-2xl font-bold text-white transition-all text-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={submitInitiator}
                  disabled={
                    !initiatorWord
                      .toUpperCase()
                      .startsWith((room?.revealed_prefix || 'T').toUpperCase()) ||
                    !clueWord.trim()
                  }
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed p-5 rounded-2xl font-bold text-white shadow-xl transition-all text-lg"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConnectModal && attempt && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50"
          onClick={closeConnect}
        >
          <div
            className="bg-white/10 backdrop-blur-2xl rounded-3xl p-10 w-full max-w-lg border border-white/20 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-3xl font-bold text-white mb-8 text-center tracking-tight">
              Connect: "{attempt.clue}"
            </h3>
            <div className="space-y-6">
              <input
                value={connectWord}
                onChange={(e) => setConnectWord(e.target.value)}
                placeholder="What word is this?"
                className="w-full p-5 rounded-2xl bg-white/20 border border-white/30 text-white text-xl placeholder-white/50 focus:border-white/50 focus:outline-none transition-all"
              />
              <div className="flex gap-4 pt-6 border-t border-white/10">
                <button
                  onClick={closeConnect}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 p-5 rounded-2xl font-bold text-white transition-all text-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={submitConnect}
                  disabled={!connectWord.trim()}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed p-5 rounded-2xl font-bold text-white shadow-xl transition-all text-lg"
                >
                  Connect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showGuessModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50"
          onClick={closeGuess}
        >
          <div
            className="bg-white/10 backdrop-blur-2xl rounded-3xl p-10 w-full max-w-lg border border-white/20 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-3xl font-bold text-white mb-8 text-center tracking-tight">
              Guess the full word
            </h3>
            <div className="space-y-6">
              <input
                value={guessWord}
                onChange={(e) => setGuessWord(e.target.value)}
                placeholder="tornado"
                className="w-full p-5 rounded-2xl bg-white/20 border border-white/30 text-white text-xl placeholder-white/50 focus:border-white/50 focus:outline-none transition-all"
              />
              <div className="flex gap-4 pt-6 border-t border-white/10">
                <button
                  onClick={closeGuess}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 p-5 rounded-2xl font-bold text-white transition-all text-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={submitGuess}
                  disabled={!guessWord.trim()}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed p-5 rounded-2xl font-bold text-white shadow-xl transition-all text-lg"
                >
                  Guess
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}