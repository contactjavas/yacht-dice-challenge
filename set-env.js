// Simple script to load environment variables from .env file
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to .env file
const envPath = path.resolve(__dirname, '.env');

try {
  // Read the .env file
  const envContent = fs.readFileSync(envPath, 'utf8');
  
  // Parse the environment variables
  const envVars = {};
  envContent.split('\n').forEach(line => {
    // Skip empty lines and comments
    if (!line || line.startsWith('#')) return;
    
    // Split by the first equals sign
    const equalIndex = line.indexOf('=');
    if (equalIndex > 0) {
      const key = line.substring(0, equalIndex).trim();
      let value = line.substring(equalIndex + 1).trim();
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      
      envVars[key] = value;
    }
  });
  
  console.log('Loaded environment variables from .env file');
  
  // Spawn the development server with the environment variables
  const env = { ...process.env, ...envVars };
  
  // Run the development server
  const devProcess = spawn('pnpm', ['run', 'dev'], { 
    env,
    stdio: 'inherit',
    shell: true
  });
  
  devProcess.on('error', (err) => {
    console.error('Failed to start development server:', err);
  });
  
} catch (error) {
  console.error('Error loading .env file:', error);
  process.exit(1);
}
