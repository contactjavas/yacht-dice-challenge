import { useState, useEffect, useCallback } from 'react';

export function useWebSocket() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 2000;
  
  // Function to create a new WebSocket connection
  const createWebSocket = useCallback(() => {
    try {
      // Initialize WebSocket connection
      // Make sure we get the correct host and protocol for WebSocket connection
      const isSecure = window.location.protocol === 'https:';
      const protocol = isSecure ? 'wss:' : 'ws:';
      const hostname = window.location.host;
      
      // Debug information about the WebSocket connection
      console.log('WebSocket Debug Info:');
      console.log('- Window Location:', window.location.toString());
      console.log('- Protocol:', protocol);
      console.log('- Hostname:', hostname);
      
      // Ensure we have a valid hostname before creating the WebSocket
      if (!hostname) {
        console.error('Invalid hostname for WebSocket connection');
        return null;
      }
      
      const wsUrl = `${protocol}//${hostname}/ws`;
      console.log('Attempting WebSocket connection to:', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      
      // Connection opened
      ws.addEventListener('open', () => {
        console.log('WebSocket connection established successfully');
        setReconnecting(false);
        setReconnectAttempts(0);
        
        // Immediately send a connection acknowledgment message
        try {
          ws.send(JSON.stringify({
            type: 'CONNECTION_ACK',
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          console.error('Failed to send connection acknowledgment:', error);
        }
      });
      
      // Connection closed
      ws.addEventListener('close', (event) => {
        console.log('WebSocket connection closed with code:', event.code, 'reason:', event.reason);
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          console.log(`Attempting to reconnect (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
          setReconnecting(true);
          setReconnectAttempts(prev => prev + 1);
          
          // Attempt to reconnect after a delay
          setTimeout(() => {
            const newWs = createWebSocket();
            if (newWs) {
              setSocket(newWs);
            }
          }, RECONNECT_DELAY * (reconnectAttempts + 1)); // Increasing delay with each attempt
        } else {
          console.log('Maximum reconnection attempts reached. Reloading page...');
          window.location.reload();
        }
      });
      
      // Connection error
      ws.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        setReconnecting(true);
      });
      
      // Message received debug
      ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', { 
            type: data.type, 
            hasPayload: !!data.payload,
            timestamp: new Date().toISOString()
          });
          
          // Handle server ping
          if (data.type === 'PING') {
            try {
              ws.send(JSON.stringify({
                type: 'PONG',
                timestamp: new Date().toISOString()
              }));
              console.log('Responded to server ping with pong');
            } catch (err) {
              console.error('Failed to respond to ping:', err);
            }
          }
        } catch (e) {
          console.log('WebSocket message received (non-JSON):', event.data?.substring(0, 100));
        }
      });
      
      return ws;
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
      return null;
    }
  }, [reconnectAttempts]);
  
  useEffect(() => {
    const ws = createWebSocket();
    if (ws) {
      setSocket(ws);
    }
    
    // Set up a ping timer to keep the connection alive
    const pingInterval = setInterval(() => {
      if (socket && socket.readyState === 1) {
        try {
          socket.send(JSON.stringify({ 
            type: 'CLIENT_PING',
            timestamp: new Date().toISOString() 
          }));
          console.log('Sent client ping to server');
        } catch (err) {
          console.error('Failed to send client ping:', err);
        }
      }
    }, 30000); // Send a ping every 30 seconds
    
    // Clean up the WebSocket connection when the component unmounts
    return () => {
      clearInterval(pingInterval);
      
      if (ws) {
        console.log('Closing WebSocket connection');
        ws.close();
      }
    };
  }, [createWebSocket, socket]);
  
  return socket;
}
