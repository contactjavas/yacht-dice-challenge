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
        <HomeScreen user={user} onLogin={handleUserLogin} />
      </Route>
      <Route path="/lobby/:code">
        {params => user ? 
          <LobbyScreen user={user} gameCode={params.code} /> : 
          <HomeScreen user={user} onLogin={handleUserLogin} />
        }
      </Route>
      <Route path="/game/:code">
        {params => user ?
          <GameScreen user={user} gameCode={params.code} onLogout={handleLogout} /> :
          <HomeScreen user={user} onLogin={handleUserLogin} />
        }
      </Route>
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
