"use client";
import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export default function GuessirMulti({ params }: { params: { roomId: string } }) {
  const supabase = createClient();
  const roomId = params.roomId || 'demo'; // For testing

  // States (now from DB)
  const [revealedPrefix, setRevealedPrefix] = useState('T');
  const [players, setPlayers] = useState<{ id: string; nickname: string; isGm: boolean }[]>([]);
  const [usedWords, setUsedWords] = useState<string[]>([]);
  const [attemptState, setAttemptState] = useState<'idle' | 'waiting_connect' | 'countdown'>('idle');
  const [currentClue, setCurrentClue] = useState('');
  const [initiatorId, setInitiatorId] = useState('');
  const [countdown, setCountdown] = useState(5);
  const [nickname, setNickname] = useState('');
  const [myId] = useState(crypto.randomUUID().slice(0, 8)); // Temp player ID

  useEffect(() => {
    // Subscribe to room changes
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setRevealedPrefix(payload.new.revealed_prefix);
          }
        }
      )
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'attempts', filter: `room_id=eq.${roomId}` },
        (payload) => console.log('New attempt:', payload.new)
      )
      .subscribe();

    // Load initial data
    loadRoomData();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadRoomData = async () => {
    // Fetch room state (simplified)
    const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (room) setRevealedPrefix(room.revealed_prefix || 'T');
  };

  const joinRoom = async () => {
    if (!nickname) return;
    // Add player (simplified, add to players array)
    setPlayers([...players, { id: myId, nickname, isGm: players.length === 0 }]);
  };

  const handleInitiate = async () => {
    const clue = prompt('Your one-word clue:') || '';
    const target = prompt('Your target word (must start with ' + revealedPrefix + '):') || '';
    if (target.toUpperCase().startsWith(revealedPrefix)) {
      setCurrentClue(clue);
      setInitiatorId(myId);
      setAttemptState('waiting_connect');
      // Save attempt to DB
      await supabase.from('attempts').insert({
        room_id: roomId,
        clue,
        initiator_id: myId,
        status: 'waiting_connect'
      });
    }
  };

  const handleConnect = async () => {
    setAttemptState('countdown');
    let count = 5;
    const timer = setInterval(async () => {
      setCountdown(--count);
      if (count <= 0) {
        clearInterval(timer);
        const guess = prompt('Say your word:') || '';
        // Save responder word, judge on backend later
        alert(`You said: ${guess}. Check console for result.`);
        setAttemptState('idle');
      }
    }, 1000);
  };

  const handleInterrupt = () => {
    setAttemptState('idle');
    alert('GM interrupted!');
  };

  const normalizeWord = (word: string) => word.toLowerCase().replace(/[^a-z]/g, '');

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-blue-600 p-8 text-white">
      <h1 className="text-4xl font-bold mb-8 text-center">🌀 Guessir Multiplayer</h1>
      <p className="text-center mb-4">Room: <code className="bg-black/30 px-3 py-1 rounded-full font-mono">{roomId}</code></p>

      {!nickname ? (
        <div className="max-w-md mx-auto bg-white/10 backdrop-blur-xl rounded-2xl p-8 text-center">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Your nickname"
            className="w-full p-4 rounded-xl bg-white/20 text-white placeholder-white/70 mb-4 text-lg"
          />
          <button onClick={joinRoom} className="w-full bg-green-500 hover:bg-green-600 p-4 rounded-xl text-xl font-bold">
            Join Room
          </button>
        </div>
      ) : (
        <>
          <div className="max-w-2xl mx-auto bg-white/10 backdrop-blur-xl rounded-2xl p-8 mb-8">
            <h2 className="text-3xl mb-4">
              Prefix: <span className="text-5xl font-black text-yellow-300">{revealedPrefix}</span>
            </h2>
            <div>Players: {players.map(p => <span key={p.id} className={`px-3 py-1 rounded-full ${p.isGm ? 'bg-red-500' : 'bg-blue-500'}`}>{p.nickname}</span>)}</div>
            <div className="mt-4">
              <h3>Used words:</h3>
              <ul className="list-disc list-inside space-y-1">{usedWords.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          </div>

          <div className="max-w-2xl mx-auto space-y-4">
            {attemptState === 'idle' && (
              <button onClick={handleInitiate} className="w-full bg-green-500 hover:bg-green-600 p-4 rounded-xl text-xl font-bold">
                🚀 Initiate Connection
              </button>
            )}

            {attemptState === 'waiting_connect' && (
              <div className="text-center p-8 bg-yellow-500/20 rounded-xl">
                <h3>🔍 Clue: "{currentClue}"</h3>
                <button onClick={handleConnect} className="mt-4 bg-blue-500 hover:bg-blue-600 px-8 py-3 rounded-xl text-lg font-bold">
                  🔗 Connect!
                </button>
                {players.some(p => p.isGm) && (
                  <button onClick={handleInterrupt} className="ml-4 bg-red-500 hover:bg-red-600 px-8 py-3 rounded-xl text-lg font-bold">
                    GM: Interrupt
                  </button>
                )}
              </div>
            )}

            {attemptState === 'countdown' && (
              <div className="text-center p-12 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl text-4xl font-black">
                COUNTDOWN: {countdown} ⏰
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  <button onClick={async () => {
  const { data } = await supabase.from('rooms').select('*');
  console.log('DB test:', data);
}}>Test DB</button>

}

