# Yacht Dice Game

A multiplayer dice game inspired by Yacht/Yahtzee built with React, Node.js, and WebSockets.

![Yacht Dice Game](https://github.com/yourusername/yacht-dice-game/raw/main/screenshots/game-screen.png)

## 🎲 About

Yacht is a classic dice game similar to Yahtzee where players roll dice and try to score points by making specific combinations. This implementation features both multiplayer and single-player modes with real-time updates using WebSockets.

## ✨ Features

- **Real-time Multiplayer**: Play with friends using WebSocket connections
- **Single-Player Mode**: Practice your strategy in solo mode
- **Responsive Design**: Play on desktop or mobile devices
- **Game Lobby System**: Create games, invite friends, and manage players
- **Persistent Game State**: Continue games even after refreshing
- **Turn-Based Gameplay**: Clear turn indicators with countdown timer
- **Robust Error Handling**: Resilient WebSocket connections that handle disconnections and reconnections
- **Interactive Dice Selection**: Choose which dice to keep between rolls
- **Comprehensive Scoring Categories**: All the classic Yacht/Yahtzee categories
- **Game History**: View completed games and scores

## 🚀 Tech Stack

- **Frontend**:
  - React with TypeScript
  - TailwindCSS for styling
  - ShadCN UI components
  - WebSocket for real-time communication

- **Backend**:
  - Node.js with Express
  - WebSocket server for real-time updates
  - PostgreSQL database with Drizzle ORM
  - TypeScript for type safety

## 🏁 Getting Started

### Prerequisites

- Node.js (v16+)
- PostgreSQL database

### Installation

1. Clone the repository
   ```
   git clone https://github.com/yourusername/yacht-dice-game.git
   cd yacht-dice-game
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Set up environment variables
   - Create a `.env` file in the project root
   - Add your PostgreSQL connection string:
     ```
     DATABASE_URL=postgresql://username:password@localhost:5432/your_database
     ```

4. Initialize the database
   ```
   npm run db:push
   ```

5. Start the development server
   ```
   npm run dev
   ```

6. Open your browser and navigate to `http://localhost:5000`

## 🎮 How to Play

1. **Create a Game**:
   - Enter your username
   - Click "Create Game"
   - Share the generated game code with friends

2. **Join a Game**:
   - Enter your username
   - Enter the game code
   - Click "Join Game"

3. **In the Lobby**:
   - Players indicate they're ready
   - The host starts the game when everyone is ready
   - Solo players can start immediately

4. **During the Game**:
   - Each turn, you can roll up to 3 times
   - Select dice to keep between rolls
   - Choose a scoring category after your rolls
   - Strategize to maximize your score

5. **Scoring Categories**:
   - **Upper Section**: Ones, Twos, Threes, Fours, Fives, Sixes
   - **Lower Section**: Three of a Kind, Four of a Kind, Full House, Small Straight, Large Straight, Yacht, Chance

## 🔍 Key Features Explained

### WebSocket Connection Management

This implementation features a robust WebSocket connection system with:
- Automatic reconnection on disconnection
- Proper cleanup of event listeners
- Comprehensive error handling
- Detailed logging for debugging
- State synchronization across clients

### Game State Management

The game maintains state across all connected clients:
- Turn-based gameplay with timers
- Validation of moves on the server
- Consistent score calculation
- Game history preservation
- Player presence tracking

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

- Dice rolling animation inspired by [rpg-dice-roller](https://github.com/GreenImp/rpg-dice-roller)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Game logic inspired by the classic Yacht/Yahtzee dice game

---

Enjoy the game and may the dice be ever in your favor!