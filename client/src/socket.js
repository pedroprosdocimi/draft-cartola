import { io } from 'socket.io-client';
import { API_URL } from './config.js';

const socket = io(API_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity
});

export default socket;
