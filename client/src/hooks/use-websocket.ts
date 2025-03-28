import { useState, useEffect } from 'react';

export function useWebSocket() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  
  useEffect(() => {
    try {
      // Initialize WebSocket connection
      // Make sure we get the correct host and protocol for WebSocket connection
      const isSecure = window.location.protocol === 'https:';
      const protocol = isSecure ? 'wss:' : 'ws:';
      const hostname = window.location.host;
      
      // Ensure we have a valid hostname before creating the WebSocket
      if (!hostname) {
        console.error('Invalid hostname for WebSocket connection');
        return;
      }
      
      const wsUrl = `${protocol}//${hostname}/ws`;
      console.log('Attempting WebSocket connection to:', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      
      // Connection opened
      ws.addEventListener('open', () => {
        console.log('WebSocket connection established');
        setReconnecting(false);
      });
      
      // Connection closed
      ws.addEventListener('close', (event) => {
        console.log('WebSocket connection closed with code:', event.code, 'reason:', event.reason);
        console.log('Attempting to reconnect...');
        setReconnecting(true);
        
        // Attempt to reconnect after a delay
        setTimeout(() => {
          console.log('Reloading page to reconnect WebSocket');
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
        console.log('Closing WebSocket connection');
        ws.close();
      };
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
      return () => {};
    }
  }, []);
  
  return socket;
}
