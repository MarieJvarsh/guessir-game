"use client";
import { useState } from 'react';

export default function Guessir() {
  // Game state (local-only for now)
  const [revealedPrefix, setRevealedPrefix] = useState('T');
  const [secretWord, setSecretWord] = useState('TORNADO'); // GM knows this
  const [usedWords, setUsedWords] = useState<string[]>([]);
  const [currentClue, setCurrentClue] = useState('');
  const [attemptState, setAttemptState] = useState<'idle' | 'waiting_connect' | 'countdown' | 'revealed'>('idle');
  const [initiatorWord, setInitiatorWord] = useState('');
  const [responderWord, setResponderWord] = useState('');
  const [countdown, setCountdown] = useState(5);

  const normalizeWord = (word: string) => word.toLowerCase().replace(/[^a-z]/g, '');

  const handleInitiate = () => {
    setCurrentClue(prompt('Your one-word clue:') || '');
    const target = prompt('Your target word (must start with ' + revealedPrefix + '):' || '');
    if (target && target.toUpperCase().startsWith(revealedPrefix)) {
      setInitiatorWord(target.toUpperCase());
      setAttemptState('waiting_connect');
    }
  };

  const handleConnect = () => {
    setAttemptState('countdown');
    let count = 5;
    const timer = setInterval(() => {
      setCountdown(--count);
      if (count <= 0) {
        clearInterval(timer);
        const guess = prompt('Say your word (must start with ' + revealedPrefix + '):');
        setResponderWord(guess?.toUpperCase() || '');
        setAttemptState('revealed');
      }
    }, 1000);
  };

  const handleReveal = () => {
    const normInit = normalizeWord(initiatorWord);
    const normResp = normalizeWord(responderWord);
    if (normInit === normResp && !usedWords.includes(normInit)) {
      setUsedWords([...usedWords, normInit]);
      const nextIndex = revealedPrefix.length;
      setRevealedPrefix(secretWord.slice(0, nextIndex + 1));
      if (nextIndex + 1 >= secretWord.length) {
        alert('Word fully revealed! You win!');
      }
    } else {
      alert('Failed: different words or already used.');
    }
    resetAttempt();
  };

  const handleInterrupt = () => {
    alert('GM interrupted!');
    resetAttempt();
  };

  const resetAttempt = () => {
    setAttemptState('idle');
    setCurrentClue('');
    setInitiatorWord('');
    setResponderWord('');
    setCountdown(5);
  };

  const guessWord = () => {
    const guess = prompt('Guess the full word:');
    if (guess?.toUpperCase() === secretWord) {
      alert('Correct! You win!');
    } else {
      alert('Wrong guess.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-blue-600 p-8 text-white">
      <h1 className="text-4xl font-bold mb-8 text-center">🌀 Guessir (Local)</h1>
      
      <div className="max-w-2xl mx-auto bg-white/10 backdrop-blur-xl rounded-2xl p-8 mb-8">
        <h2 className="text-3xl mb-4">Current prefix: <span className="text-5xl font-black text-yellow-300">{revealedPrefix}</span></h2>
        <p className="mb-4 text-lg">Secret word: <code className="bg-black/30 px-2 py-1 rounded">{secretWord}</code> (GM view)</p>
        <div className="mb-4">
          <h3>Used words:</h3>
          <ul className="list-disc list-inside space-y-1">
            {usedWords.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        {attemptState === 'idle' && (
          <>
            <button onClick={handleInitiate} className="w-full bg-green-500 hover:bg-green-600 p-4 rounded-xl text-xl font-bold">
              🚀 Initiate Connection
            </button>
            <button onClick={guessWord} className="w-full bg-orange-500 hover:bg-orange-600 p-4 rounded-xl text-xl font-bold">
              🎯 Guess GM Word
            </button>
          </>
        )}

        {attemptState === 'waiting_connect' && (
          <div className="text-center p-8 bg-yellow-500/20 rounded-xl">
            <h3>Clue: "{currentClue}"</h3>
            <p className="text-xl mt-4">(Waiting for someone to connect...)</p>
            <button onClick={handleConnect} className="mt-4 bg-blue-500 hover:bg-blue-600 px-8 py-3 rounded-xl text-lg font-bold">
              🔗 Connect!
            </button>
            <button onClick={handleInterrupt} className="ml-4 bg-red-500 hover:bg-red-600 px-8 py-3 rounded-xl text-lg font-bold">
              GM: Interrupt
            </button>
          </div>
        )}

        {attemptState === 'countdown' && (
          <div className="text-center p-12 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl text-4xl font-black">
            COUNTDOWN: {countdown}
            <div className="text-xl mt-4">
              <button onClick={handleInterrupt} className="bg-white text-red-600 px-6 py-2 rounded-lg font-bold">
                GM INTERRUPT NOW
              </button>
            </div>
          </div>
        )}

        {attemptState === 'revealed' && (
          <div className="text-center p-8 bg-gray-800/50 rounded-xl">
            <p>Initiator said: {initiatorWord}</p>
            <p>Responder said: {responderWord}</p>
            <button onClick={handleReveal} className="w-full bg-emerald-500 hover:bg-emerald-600 p-4 rounded-xl text-xl font-bold mt-4">
              ✅ Judge Result
            </button>
          </div>
        )}
      </div>
    </div>
  );
}