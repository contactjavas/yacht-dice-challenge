import { useState, useEffect, useRef, useCallback } from "react";

// Connection states that provide more information than the native WebSocket readyState
export enum ConnectionState {
  INITIAL = 'initial',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTED = 'disconnected',
  CLOSED = 'closed'
}

/**
 * Enhanced WebSocket hook with automatic reconnection and improved error handling
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Detailed connection state tracking
 * - Safe cleanup on unmount
 * - Connection URL determination based on environment
 * - Detailed logging for debugging
 */
export function useWebSocket() {
  // The actual WebSocket instance
  const [socket, setSocket] = useState<WebSocket | null>(null);
  
  // Detailed connection state for better UI feedback
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.INITIAL);
  
  // Keep track of mount state to prevent state updates after unmount
  const isMounted = useRef(true);
  
  // Track reconnection attempts
  const reconnectCount = useRef(0);
  
  // Timer for reconnection attempts
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Store WebSocket instance in a ref for access in cleanup
  const socketRef = useRef<WebSocket | null>(null);
  
  // Track if cleanup has been called
  const cleanupCalled = useRef(false);

  // Get the appropriate WebSocket URL based on environment
  const getWebSocketUrl = useCallback(() => {
    try {
      // Determine if we're in a local development environment or Replit
      const isLocalDev = window.location.hostname === "localhost" || 
                        window.location.hostname === "127.0.0.1";

      // Use appropriate WebSocket URL based on environment
      if (isLocalDev) {
        // For local development, use ws:// protocol with the same port
        return `ws://${window.location.hostname}:${window.location.port}/ws`;
      } else {
        // For Replit or production, use wss:// protocol
        return `wss://${window.location.hostname}/ws`;
      }
    } catch (error) {
      console.error("Error determining WebSocket URL:", error);
      // Fallback to a reasonable default
      return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    }
  }, []);

  // Function to create and connect a WebSocket
  const connectWebSocket = useCallback(() => {
    // Don't try to connect if cleanup has been called
    if (cleanupCalled.current || !isMounted.current) {
      console.log("Not connecting: component has been unmounted");
      return;
    }
    
    try {
      // Update connection state
      setConnectionState(reconnectCount.current > 0 ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING);
      
      // Get the WebSocket URL
      const wsUrl = getWebSocketUrl();
      console.log(`${reconnectCount.current > 0 ? 'Reconnecting' : 'Connecting'} WebSocket to: ${wsUrl} (Attempt #${reconnectCount.current + 1})`);
      
      // Create new WebSocket
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;
      
      // Connection opened
      ws.addEventListener("open", () => {
        if (!isMounted.current || cleanupCalled.current) return;
        
        console.log(`WebSocket connection ${reconnectCount.current > 0 ? 're-' : ''}established successfully`);
        setConnectionState(ConnectionState.CONNECTED);
        setSocket(ws);
        
        // Reset reconnect count on successful connection
        reconnectCount.current = 0;
      });
      
      // Connection error
      ws.addEventListener("error", (error) => {
        if (!isMounted.current || cleanupCalled.current) return;
        
        console.error("WebSocket connection error:", error);
        // Don't change state here, let the close handler deal with it
      });
      
      // Connection closed
      ws.addEventListener("close", (event) => {
        if (!isMounted.current || cleanupCalled.current) return;
        
        console.log(`WebSocket closed with code ${event.code} and reason: ${event.reason || "No reason provided"}`);
        
        // Update connection state and socket state
        setConnectionState(event.wasClean ? ConnectionState.CLOSED : ConnectionState.DISCONNECTED);
        setSocket(null);
        
        // Handle non-normal closure (only if not cleanup)
        if (!event.wasClean && event.code !== 1000 && event.code !== 1001) {
          // Try to reconnect with exponential backoff
          scheduleReconnect();
        }
      });
      
      return ws;
    } catch (error) {
      if (!isMounted.current || cleanupCalled.current) return null;
      
      console.error("Error creating WebSocket:", error);
      setConnectionState(ConnectionState.DISCONNECTED);
      
      // Try to reconnect
      scheduleReconnect();
      
      return null;
    }
  }, [getWebSocketUrl, setConnectionState]);
  
  // Schedule a reconnection attempt with exponential backoff
  const scheduleReconnect = useCallback(() => {
    if (cleanupCalled.current || !isMounted.current) return;
    
    // Clear any existing timer
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    
    // Calculate backoff time (in ms): 100ms, 200ms, 400ms, 800ms, etc. up to 30 seconds
    const backoff = Math.min(30000, Math.pow(2, reconnectCount.current) * 100);
    console.log(`Scheduling reconnection attempt in ${backoff}ms`);
    
    // Schedule reconnection
    reconnectTimer.current = setTimeout(() => {
      if (cleanupCalled.current || !isMounted.current) return;
      
      reconnectCount.current += 1;
      connectWebSocket();
    }, backoff);
  }, [/* Intentionally not dependent on connectWebSocket to avoid circular dependency */]);
  
  // Set up WebSocket connection on mount
  useEffect(() => {
    // Reset mount state
    isMounted.current = true;
    cleanupCalled.current = false;
    
    // Create initial connection
    connectWebSocket();
    
    // Cleanup on unmount
    return () => {
      // Prevent further reconnection attempts or state updates
      isMounted.current = false;
      cleanupCalled.current = true;
      
      // Clear any reconnection timer
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      
      // Close the socket if it exists
      if (socketRef.current) {
        console.log("Cleaning up WebSocket connection on unmount");
        
        try {
          // Only attempt to close if not already closed
          if (
            socketRef.current.readyState === WebSocket.OPEN ||
            socketRef.current.readyState === WebSocket.CONNECTING
          ) {
            socketRef.current.close(1000, "Component unmounted");
          }
          
          // Remove all event listeners to prevent memory leaks
          socketRef.current.onopen = null;
          socketRef.current.onclose = null;
          socketRef.current.onerror = null;
          socketRef.current.onmessage = null;
        } catch (error) {
          console.error("Error during WebSocket cleanup:", error);
        }
        
        // Release the socket reference
        socketRef.current = null;
      }
    };
  }, [connectWebSocket]);
  
  // Return both the socket and connection state for better UI feedback
  return socket;
}
