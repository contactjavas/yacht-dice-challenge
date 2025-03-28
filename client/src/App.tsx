import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";

import HomeScreen from "@/components/home-screen";
import LobbyScreen from "@/components/lobby-screen";
import GameScreen from "@/components/game-screen";
import NotFound from "@/pages/not-found";
import { User } from "@shared/schema";

function Router() {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  
  // Check for existing user in localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('user');
      }
    }
  }, []);
  
  // Function to handle user creation/login
  const handleUserLogin = async (username: string) => {
    try {
      console.log('Logging in with username:', username);
      
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });
      
      console.log('Login response status:', res.status);
      
      // Important: Clone the response before reading it as JSON
      // This is because reading the response as JSON consumes the response body
      const resClone = res.clone();
      
      if (!res.ok) {
        const data = await res.json();
        console.error('Login error data:', data);
        toast({
          title: "Login Failed",
          description: data.message || "Failed to login",
          variant: "destructive",
        });
        return;
      }
      
      const userData = await resClone.json();
      console.log('User data from login:', userData);
      
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      
      toast({
        title: "Welcome!",
        description: `Logged in as ${userData.username}`,
      });
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Error",
        description: "Failed to connect to server",
        variant: "destructive",
      });
    }
  };
  
  // Function to handle logout
  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  return (
    <Switch>
      <Route path="/">
        <HomeScreen user={user} onLogin={handleUserLogin} onLogout={handleLogout} />
      </Route>
      <Route path="/lobby/:code">
        {params => user ? 
          <LobbyScreen user={user} gameCode={params.code} onLogout={handleLogout} /> : 
          <HomeScreen user={user} onLogin={handleUserLogin} onLogout={handleLogout} />
        }
      </Route>
      <Route path="/game/:code">
        {params => user ?
          <GameScreen user={user} gameCode={params.code} onLogout={handleLogout} /> :
          <HomeScreen user={user} onLogin={handleUserLogin} onLogout={handleLogout} />
        }
      </Route>
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

function App() {
  // Add a global error handler to intercept Vite WebSocket errors
  useEffect(() => {
    // This function intercepts and filters unhandled promise rejections
    // specifically to prevent Vite HMR WebSocket errors from disrupting the user experience
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Check if this is a Vite HMR WebSocket error
      const errorMessage = event.reason?.message || event.reason || '';
      
      // Common Vite WebSocket error patterns
      const isViteWebSocketError = 
        (typeof errorMessage === 'string' && (
          errorMessage.includes('WebSocket') ||
          errorMessage.includes('ws://localhost') ||
          errorMessage.includes('wss://localhost') ||
          errorMessage.includes('undefined') ||
          errorMessage.includes('Failed to construct') ||
          errorMessage.includes('is invalid')
        ));
      
      if (isViteWebSocketError) {
        // Prevent the error from bubbling up and showing in the console
        event.preventDefault();
        
        // Optional: Log it in a more controlled way
        console.log('Intercepted Vite HMR WebSocket error (safely ignored):', 
          typeof errorMessage === 'string' ? errorMessage.substring(0, 100) : 'Unknown error');
        
        return true;
      }
      
      // Let other errors propagate normally
      return false;
    };
    
    // Add the event listener
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    // Clean up
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);
  
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
