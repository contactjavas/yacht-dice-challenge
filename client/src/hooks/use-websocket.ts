import { useState, useEffect } from 'react';

export function useWebSocket() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  
  useEffect(() => {
    // Initialize WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    
    // Connection opened
    ws.addEventListener('open', () => {
      console.log('WebSocket connection established');
      setReconnecting(false);
    });
    
    // Connection closed
    ws.addEventListener('close', () => {
      console.log('WebSocket connection closed, attempting to reconnect...');
      setReconnecting(true);
      
      // Attempt to reconnect after a delay
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    });
    
    // Connection error
    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      setReconnecting(true);
    });
    
    setSocket(ws);
    
    // Clean up the WebSocket connection when the component unmounts
    return () => {
      ws.close();
    };
  }, []);
  
  return socket;
}
