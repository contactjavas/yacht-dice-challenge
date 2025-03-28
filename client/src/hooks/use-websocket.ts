import { useState, useEffect, useCallback } from 'react';

export function useWebSocket() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [connectionFailed, setConnectionFailed] = useState(false); // Track if connection completely failed
  const MAX_RECONNECT_ATTEMPTS = 3; // Reduced from 5 to avoid too many retries
  const RECONNECT_DELAY = 2000;
  
  // Function to create a new WebSocket connection
  const createWebSocket = useCallback(() => {
    // If we've determined that connection has completely failed, don't try anymore
    if (connectionFailed) {
      console.warn('WebSocket: Connection has previously failed completely, not attempting reconnection');
      return null;
    }
    
    try {
      // Initialize WebSocket connection
      // Make sure we get the correct host and protocol for WebSocket connection
      const isSecure = window.location.protocol === 'https:';
      const hostname = window.location.host;
      const domainName = window.location.hostname;
      const port = window.location.port;
      
      // Enhanced debug information about the WebSocket connection environment
      console.log('WebSocket Environment Detection:', {
        windowLocation: window.location.toString(),
        wsProtocol: isSecure ? 'wss:' : 'ws:',
        hostname,
        domainName,
        port,
        isSecure,
        isReplit: domainName.includes('.replit.dev') || domainName.includes('.repl.co'),
        reconnectAttempts
      });
      
      // Ensure we have a valid hostname before creating the WebSocket
      if (!hostname) {
        console.error('Invalid hostname for WebSocket connection');
        setConnectionFailed(true);
        return null;
      }
      
      // Properly construct full WebSocket URL - this is critical to avoid connection issues
      const wsProtocol = isSecure ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${hostname}/ws`;
      
      console.log(`[${new Date().toISOString()}] Connecting to WebSocket at full URL: ${wsUrl}`);
      
      // Catch and handle WebSocket connection errors
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch (error) {
        // Specifically handle the "invalid URL" error with detailed logging
        console.error('Failed to construct WebSocket:', error);
        
        // Check for the specific "undefined" error we're seeing
        if (error instanceof SyntaxError && 
            (error.message.includes('invalid') || error.message.includes('undefined'))) {
          console.error('This is the undefined port error we are looking for. Marking connection as failed.');
          setConnectionFailed(true);
          return null;
        }
        
        // For any other error, throw it to be caught by the outer catch block
        throw error;
      }
      
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
      
      // Connection closed with better error discrimination
      ws.addEventListener('close', (event) => {
        console.log('WebSocket connection closed with code:', event.code, 'reason:', event.reason);
        
        // Detect if this is likely a Vite HMR WebSocket being closed during development
        // Normal codes are 1000 (normal closure) and 1001 (going away)
        // Random closes without reason that happen immediately are likely from HMR
        const isLikelyHMRClose = !event.reason && event.code === 1006 && reconnectAttempts > 0;
        
        if (isLikelyHMRClose) {
          console.log('This appears to be a Vite HMR WebSocket close. Preventing excessive reconnect loop.');
          // Only reconnect once more, and if that fails, give up to prevent loops
          if (reconnectAttempts >= 1) {
            console.log('Already attempted reconnect after HMR close. Stopping to prevent loop.');
            setConnectionFailed(true);
            return;
          }
        }
        
        // Normal reconnection flow
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          console.log(`Attempting to reconnect (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
          setReconnecting(true);
          setReconnectAttempts(prev => prev + 1);
          
          // Attempt to reconnect after a delay with exponential backoff
          const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
          console.log(`Will attempt reconnect in ${delay}ms`);
          
          setTimeout(() => {
            const newWs = createWebSocket();
            if (newWs) {
              setSocket(newWs);
            } else {
              console.log('Failed to create new WebSocket during reconnect attempt');
            }
          }, delay);
        } else {
          console.log('Maximum reconnection attempts reached.');
          setConnectionFailed(true);
        }
      });
      
      // Connection error with improved handling
      ws.addEventListener('error', (error) => {
        console.error(`[WebSocket][${new Date().toISOString()}] Error on connection to ${wsUrl}:`, error);
        console.log('WebSocket readyState:', ws.readyState);
        
        // Don't set reconnecting immediately - wait for the close event which follows error events
        // This prevents multiple reconnection attempts
        if (ws.readyState === WebSocket.CLOSED) {
          console.log('WebSocket already closed after error - triggering reconnect');
          setReconnecting(true);
        } else {
          console.log('WebSocket error but not closed - waiting for close event');
        }
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
  
  // Create a function to show an alert about connection issues
  const showConnectionIssueAlert = useCallback(() => {
    // This would typically use your app's toast or alert mechanism
    console.error("CRITICAL: WebSocket connection failed completely. Please refresh the page or try again later.");
    
    // Create a user-visible error message element
    const existingAlert = document.getElementById('ws-connection-error');
    if (!existingAlert) {
      // Create an error banner at the top of the page
      const alertDiv = document.createElement('div');
      alertDiv.id = 'ws-connection-error';
      alertDiv.style.position = 'fixed';
      alertDiv.style.top = '0';
      alertDiv.style.left = '0';
      alertDiv.style.right = '0';
      alertDiv.style.backgroundColor = '#f44336';
      alertDiv.style.color = 'white';
      alertDiv.style.padding = '10px';
      alertDiv.style.textAlign = 'center';
      alertDiv.style.zIndex = '9999';
      alertDiv.innerHTML = 'Connection to game server failed. <button id="ws-reload-btn" style="background: white; color: #f44336; border: none; padding: 5px 10px; border-radius: 4px; margin-left: 10px; cursor: pointer;">Refresh Page</button>';
      
      document.body.prepend(alertDiv);
      
      // Add reload button functionality
      document.getElementById('ws-reload-btn')?.addEventListener('click', () => {
        window.location.reload();
      });
    }
  }, []);

  // Monitor the connectionFailed state and show alert when it changes to true
  useEffect(() => {
    if (connectionFailed) {
      showConnectionIssueAlert();
    }
  }, [connectionFailed, showConnectionIssueAlert]);

  // This useEffect is for the initial connection and reconnection logic
  useEffect(() => {
    console.log(`[${new Date().toISOString()}] Setting up WebSocket connection. Previous attempts: ${reconnectAttempts}`);
    
    // Create the WebSocket connection
    const ws = createWebSocket();
    if (ws) {
      console.log(`[${new Date().toISOString()}] Initial WebSocket created successfully, readyState: ${ws.readyState}`);
      setSocket(ws);
      
      // Set up a manual health check to detect stalled connections
      const healthCheckId = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn(`[${new Date().toISOString()}] Health check found WebSocket in state ${ws.readyState}, not OPEN (1)`);
          if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            console.warn('WebSocket found closed during health check. Clearing interval and attempting reconnect.');
            clearInterval(healthCheckId);
            
            // Only attempt reconnect if we haven't hit our max attempts
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              setReconnecting(true);
              setReconnectAttempts(prev => prev + 1);
            } else {
              setConnectionFailed(true);
            }
          }
        } else {
          console.log(`[${new Date().toISOString()}] WebSocket health check: Connection is OPEN`);
        }
      }, 5000); // Check every 5 seconds
      
      // Clean up on unmount
      return () => {
        clearInterval(healthCheckId);
        console.log('Unmounting component - closing WebSocket connection');
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, 'Component unmounted');
        }
      };
    } else if (connectionFailed) {
      // If createWebSocket returns null because of connectionFailed, show the alert
      showConnectionIssueAlert();
    }
    
    // No cleanup function if ws is null
    return () => {}; 
  }, [createWebSocket, reconnectAttempts, connectionFailed, showConnectionIssueAlert]);
  
  // Separate useEffect for ping/pong keep-alive
  useEffect(() => {
    if (!socket) return;
    
    console.log(`[${new Date().toISOString()}] Setting up ping interval for WebSocket`);
    
    // Set up a ping timer to keep the connection alive
    const pingInterval = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ 
            type: 'CLIENT_PING',
            timestamp: new Date().toISOString() 
          }));
          console.log(`[${new Date().toISOString()}] Sent client ping to server`);
        } catch (err) {
          console.error(`[${new Date().toISOString()}] Failed to send client ping:`, err);
        }
      } else if (socket) {
        console.warn(`[${new Date().toISOString()}] Cannot send ping - socket state: ${socket.readyState}`);
      }
    }, 15000); // Send a ping every 15 seconds (reduced from 30s for more frequent keepalive)
    
    // Clean up only the ping interval when socket changes
    return () => {
      clearInterval(pingInterval);
      console.log(`[${new Date().toISOString()}] Cleaned up ping interval`);
    };
  }, [socket]);
  
  return socket;
}
