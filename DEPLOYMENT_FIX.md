# Deployment Fix for Vercel

## Changes Made

### 1. **Updated package.json scripts**
   - `build`: Now compiles TypeScript (`tsc`) before building the client
   - `start`: Changed from `tsx src/server.ts` to `node dist/server.js` (compiled JavaScript)

### 2. **Updated src/server.ts**
   - Added logic to detect production environment and use correct path to client dist folder
   - In production (`NODE_ENV=production`): Uses `__dirname/../client/dist`
   - In development: Uses `process.cwd()/client/dist`

### 3. **Added vercel.json**
   - Configures Vercel build and start commands
   - Sets `NODE_ENV=production` for proper path resolution

## How It Works

**Before (Broken):**
```
Vercel runs:
  npm run build → only builds client (server not compiled)
  npm start → tries to run tsx (TypeScript runtime) on non-existent src/server.ts
  Result: No JavaScript files served, blue background
```

**After (Fixed):**
```
Vercel runs:
  npm run build → compiles TypeScript to dist/, then builds client
  npm start → runs node dist/server.js (compiled JavaScript)
  Server serves static files from client/dist/
  Result: App loads correctly
```

## Deployment Steps

1. Push changes to your GitHub repository
2. Vercel will automatically:
   - Run `npm run build` (TypeScript → JavaScript, then client)
   - Run `npm start` (Node server with static file serving)
   - Your app should now load properly

## Local Testing

```bash
# Build everything
npm run build

# Test with production settings
NODE_ENV=production node dist/server.js

# Visit http://localhost:3001
```

## Key Files Modified

- `/package.json` - Build and start scripts
- `/src/server.ts` - Path resolution for static files
- `/vercel.json` - Vercel deployment configuration (new)
