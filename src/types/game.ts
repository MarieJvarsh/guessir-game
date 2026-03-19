export interface Player {
  id: string;
  nickname: string;
  is_gm: boolean;
}

export interface Attempt {
  id: string;
  clue: string;
  initiator_id: string;
  responder_id?: string;
  word_initiator: string;
  word_responder?: string;
  status: 'waiting_connect' | 'countdown' | 'success' | 'fail';
  countdown?: number;
  interrupted: boolean;
}

export interface ChatMessage {
  username: string;
  message: string;
}