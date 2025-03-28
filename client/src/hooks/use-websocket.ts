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
      const domainName = window.location.hostname;
      const port = window.location.port;
      
      // Enhanced debug information about the WebSocket connection environment
      console.log('WebSocket Environment Detection:', {
        windowLocation: window.location.toString(),
        wsProtocol: protocol,
        hostname,
        domainName,
        port,
        isSecure,
        isReplit: domainName.includes('.replit.dev') || domainName.includes('.repl.co')
      });
      
      // Ensure we have a valid hostname before creating the WebSocket
      if (!hostname) {
        console.error('Invalid hostname for WebSocket connection');
        return null;
      }
      
      // Construct WebSocket URL
      let wsUrl;
      
      try {
        // On Replit, we use the direct relative path approach to avoid any issues with the hostname
        if (window.location.hostname.includes('.replit.dev') || 
            window.location.hostname.includes('.repl.co')) {
          // For Replit deployment, use a relative path
          // This avoids issues with hostname resolution on Replit
          wsUrl = '/ws';
          console.log('Using Replit environment relative WebSocket path');
        } else if (hostname.includes('localhost')) {
          // For local development
          const port = window.location.port || '5000';
          wsUrl = `${protocol}//localhost:${port}/ws`;
          console.log('Using localhost WebSocket connection with port', port);
        } else {
          // Fallback for other environments - use the current host
          wsUrl = `${protocol}//${hostname}/ws`;
          console.log('Using standard WebSocket connection for non-Replit environment');
        }
      } catch (error) {
        console.error('Error constructing WebSocket URL:', error);
        // Safe fallback - always use a relative path as the safest option
        wsUrl = '/ws';
        console.log('Using fallback relative WebSocket path due to error');
      }
      
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
        console.error(`[WebSocket][${new Date().toISOString()}] Error on connection to ${wsUrl}:`, error);
        console.log('WebSocket readyState:', ws.readyState);
        setReconnecting(true);
      });
      
      // Message received debug
      ws.addEventListener('message', (event) => {
        // Add more detailed debug info
        console.log(`[WebSocket][${new Date().toISOString()}] Message received on ${wsUrl}`);
        
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message data:', { 
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
