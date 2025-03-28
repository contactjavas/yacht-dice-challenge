import { useState, useEffect } from 'react';

/**
 * Simplified WebSocket hook that only does the connection correctly
 * without all the extra complexity that might be causing issues
 */
export function useWebSocket() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  
  useEffect(() => {
    let ws: WebSocket | null = null;
    let cleanupCalled = false;
    
    // Simple function to create WebSocket with basic error handling
    const createWebSocket = () => {
      try {
        // Always use domain without port for Replit environment
        const wsUrl = `wss://${window.location.hostname}/ws`;
        console.log(`Creating WebSocket connection to: ${wsUrl}`);
        
        // Create the WebSocket
        ws = new WebSocket(wsUrl);
        
        // Log the connection process
        ws.addEventListener('open', () => {
          console.log('WebSocket connection established successfully');
          
          // Only update state if cleanup hasn't been called
          if (!cleanupCalled) {
            setSocket(ws);
          }
        });
        
        ws.addEventListener('error', (error) => {
          console.error('WebSocket connection error:', error);
        });
        
        ws.addEventListener('close', (event) => {
          console.log(`WebSocket closed with code ${event.code} and reason: ${event.reason || 'No reason provided'}`);
          
          // Only update state if cleanup hasn't been called
          if (!cleanupCalled) {
            setSocket(null);
          }
        });
        
        return ws;
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        return null;
      }
    };
    
    // Create the WebSocket connection
    createWebSocket();
    
    // Cleanup function
    return () => {
      cleanupCalled = true;
      
      if (ws) {
        console.log('Cleaning up WebSocket connection');
        
        // Only close if it's open or connecting
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'Component unmounted');
        }
        
        // Remove all listeners to prevent memory leaks
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        
        // Set state to null if not already
        setSocket(null);
      }
    };
  }, []);
  
  return socket;
}
